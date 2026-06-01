import type { App, BrowserWindow, MenuItemConstructorOptions } from 'electron'
import { ELECTRON_EVENT_CHANNELS } from '../ipc/channels'

export type NativeMenuDestination = 'about' | 'settings'

export function buildApplicationMenuTemplate(
  appName: string,
  onNavigate: (destination: NativeMenuDestination) => void,
  platform = process.platform,
): MenuItemConstructorOptions[] {
  const appMenu: MenuItemConstructorOptions[] = platform === 'darwin'
    ? [{
        label: appName,
        submenu: [
          { label: `About ${appName}`, click: () => onNavigate('about') },
          { type: 'separator' },
          { label: 'Settings...', accelerator: 'CmdOrCtrl+,', click: () => onNavigate('settings') },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      }]
    : [{
        label: 'File',
        submenu: [
          { label: 'Settings...', accelerator: 'Ctrl+,', click: () => onNavigate('settings') },
          { type: 'separator' },
          { role: 'quit' },
        ],
      }]

  return [
    ...appMenu,
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { role: 'close' },
      ],
    },
  ]
}

export async function installApplicationMenu(app: App, getMainWindow: () => BrowserWindow | null) {
  const { Menu } = await import('electron')
  const template = buildApplicationMenuTemplate(app.name || 'Claude Code Haha', destination => {
    getMainWindow()?.webContents.send(ELECTRON_EVENT_CHANNELS.nativeMenuNavigate, destination)
  })
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
