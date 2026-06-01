import { browserHost } from './browserHost'
import type {
  DesktopHost,
  DesktopHostUnlisten,
  TerminalExitEvent,
  TerminalOutputEvent,
} from './types'

const tauriCapabilities: DesktopHost['capabilities'] = {
  appMode: true,
  dialogs: true,
  notifications: true,
  previewWebview: true,
  shell: true,
  terminal: true,
  updates: true,
  windowControls: true,
  zoom: true,
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const api = await import('@tauri-apps/api/core')
  return typeof args === 'undefined'
    ? api.invoke<T>(command)
    : api.invoke<T>(command, args)
}

async function listen<T>(
  eventName: string,
  handler: (payload: T) => void,
): Promise<DesktopHostUnlisten> {
  const events = await import('@tauri-apps/api/event')
  return events.listen<T>(eventName, (event) => handler(event.payload))
}

export const tauriHost: DesktopHost = {
  ...browserHost,
  kind: 'tauri',
  isDesktop: true,
  capabilities: tauriCapabilities,
  runtime: {
    getServerUrl() {
      return invoke<string>('get_server_url')
    },
  },
  app: {
    async getVersion() {
      const { getVersion } = await import('@tauri-apps/api/app')
      return getVersion()
    },
  },
  commands: {
    invoke,
  },
  events: {
    listen,
  },
  webview: {
    async onDragDropEvent(handler) {
      const { getCurrentWebview } = await import('@tauri-apps/api/webview')
      return getCurrentWebview().onDragDropEvent(handler)
    },
  },
  shell: {
    async open(target) {
      const { open } = await import('@tauri-apps/plugin-shell')
      await open(target)
    },
    async openPath(path) {
      const { open } = await import('@tauri-apps/plugin-shell')
      await open(path)
    },
  },
  dialogs: {
    async open(options) {
      const { open } = await import('@tauri-apps/plugin-dialog')
      return open(options)
    },
    async save(options) {
      const { save } = await import('@tauri-apps/plugin-dialog')
      return save(options)
    },
  },
  notifications: {
    async permissionState() {
      const { isPermissionGranted } = await import('@tauri-apps/plugin-notification')
      return await isPermissionGranted() ? 'granted' : 'default'
    },
    async requestPermission() {
      const {
        isPermissionGranted,
        requestPermission,
      } = await import('@tauri-apps/plugin-notification')
      if (await isPermissionGranted()) return 'granted'
      const permission = await requestPermission()
      return permission === 'granted' || permission === 'denied' || permission === 'default'
        ? permission
        : 'default'
    },
    async send(options) {
      const { sendNotification } = await import('@tauri-apps/plugin-notification')
      sendNotification(options)
    },
    async onAction(handler) {
      const notification = await import('@tauri-apps/plugin-notification') as {
        onAction?: (cb: (payload: unknown) => void) => Promise<unknown>
      }
      if (!notification.onAction) return () => {}
      const listener = await notification.onAction(handler)
      return () => {
        if (typeof listener === 'function') {
          listener()
          return
        }
        const unregister = listener && typeof listener === 'object'
          ? (listener as { unregister?: () => Promise<void> | void }).unregister
          : undefined
        if (typeof unregister === 'function') void unregister.call(listener)
      }
    },
    async ackAction() {
      return false
    },
  },
  window: {
    async minimize() {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      await getCurrentWindow().minimize()
    },
    async toggleMaximize() {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      await getCurrentWindow().toggleMaximize()
    },
    async close() {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      await getCurrentWindow().close()
    },
    async startDragging() {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      await getCurrentWindow().startDragging()
    },
    async requestAttention() {
      const { getCurrentWindow, UserAttentionType } = await import('@tauri-apps/api/window')
      await getCurrentWindow().requestUserAttention(UserAttentionType.Critical)
    },
    async focus() {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      const win = getCurrentWindow()
      await (win as unknown as { show?: () => Promise<void> | void }).show?.()
      await (win as unknown as { setFocus?: () => Promise<void> | void }).setFocus?.()
    },
    async isMaximized() {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      return getCurrentWindow().isMaximized()
    },
    async onResized(handler) {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      return getCurrentWindow().onResized(handler)
    },
    onNativeMenuNavigate(handler) {
      return listen('native-menu-navigate', handler)
    },
  },
  updates: {
    async check(options) {
      const updater = await import('@tauri-apps/plugin-updater')
      return updater.check(options)
    },
    prepareInstall() {
      return invoke('prepare_for_update_install')
    },
    cancelInstall() {
      return invoke('cancel_update_install')
    },
    async relaunch() {
      const { relaunch } = await import('@tauri-apps/plugin-process')
      await relaunch()
    },
  },
  terminal: {
    spawn(input) {
      return invoke('terminal_spawn', input)
    },
    write(sessionId, data) {
      return invoke('terminal_write', { sessionId, data })
    },
    resize(sessionId, cols, rows) {
      return invoke('terminal_resize', { sessionId, cols, rows })
    },
    kill(sessionId) {
      return invoke('terminal_kill', { sessionId })
    },
    onOutput(handler) {
      return listen<TerminalOutputEvent>('terminal-output', handler)
    },
    onExit(handler) {
      return listen<TerminalExitEvent>('terminal-exit', handler)
    },
    getBashPath() {
      return invoke<string | null>('get_terminal_bash_path')
    },
    setBashPath(path) {
      return invoke('set_terminal_bash_path', { path })
    },
  },
  preview: {
    open(url, bounds) {
      return invoke('preview_open', { url, bounds })
    },
    navigate(url) {
      return invoke('preview_navigate', { url })
    },
    setBounds(bounds) {
      return invoke('preview_set_bounds', { bounds })
    },
    setVisible(visible) {
      return invoke('preview_set_visible', { visible })
    },
    close() {
      return invoke('preview_close')
    },
    message(payload) {
      return invoke('preview_message', { raw: JSON.stringify(payload) })
    },
    onEvent(handler) {
      return listen('preview://event', handler)
    },
  },
  zoom: {
    set(level) {
      return invoke('set_app_zoom', { zoomFactor: level })
    },
  },
  adapters: {
    restartSidecar() {
      return invoke('restart_adapters_sidecar')
    },
  },
  appMode: {
    get() {
      return invoke('get_app_mode')
    },
    set(config) {
      return invoke('set_app_mode', config)
    },
    detectPortableDir() {
      return invoke('detect_portable_dir')
    },
    prepareRestart() {
      return invoke('prepare_for_app_mode_restart')
    },
    restart() {
      return tauriHost.updates.relaunch()
    },
  },
}
