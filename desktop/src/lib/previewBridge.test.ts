import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WebviewBounds } from '../components/browser/computeWebviewBounds'
import { browserHost } from './desktopHost/browserHost'

const invoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }))
vi.mock('./desktopRuntime', () => ({ isTauriRuntime: () => true }))

beforeEach(() => {
  window.__TAURI_INTERNALS__ = {}
})

afterEach(() => {
  invoke.mockReset()
  Reflect.deleteProperty(window, 'desktopHost')
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__')
  Reflect.deleteProperty(window, '__TAURI__')
})

describe('previewBridge', () => {
  it('openPreview forwards url + bounds to preview_open', async () => {
    const { previewBridge } = await import('./previewBridge')
    const bounds: WebviewBounds = { x: 1, y: 2, width: 3, height: 4 }
    await previewBridge.open('http://localhost/a', bounds)
    expect(invoke).toHaveBeenCalledWith('preview_open', { url: 'http://localhost/a', bounds })
  })

  it('setBounds forwards to preview_set_bounds', async () => {
    const { previewBridge } = await import('./previewBridge')
    await previewBridge.setBounds({ x: 0, y: 0, width: 10, height: 10 })
    expect(invoke).toHaveBeenCalledWith('preview_set_bounds', { bounds: { x: 0, y: 0, width: 10, height: 10 } })
  })

  it('message forwards structured host messages to preview_message', async () => {
    const { previewBridge } = await import('./previewBridge')
    await previewBridge.message({ v: 1, type: 'capture', kind: 'full' })
    expect(invoke).toHaveBeenCalledWith('preview_message', { raw: '{"v":1,"type":"capture","kind":"full"}' })
  })

  it('is a no-op outside the Tauri runtime', async () => {
    vi.resetModules()
    vi.doMock('./desktopRuntime', () => ({ isTauriRuntime: () => false }))
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__')
    const { previewBridge } = await import('./previewBridge')
    await previewBridge.open('http://localhost/a', { x: 0, y: 0, width: 1, height: 1 })
    expect(invoke).not.toHaveBeenCalled()
  })

  it('routes preview commands through an injected desktop host', async () => {
    vi.resetModules()
    vi.doMock('./desktopRuntime', () => ({ isTauriRuntime: () => false }))
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__')
    const open = vi.fn().mockResolvedValue(undefined)
    const setBounds = vi.fn().mockResolvedValue(undefined)
    const message = vi.fn().mockResolvedValue(undefined)

    window.desktopHost = {
      ...browserHost,
      kind: 'electron',
      isDesktop: true,
      capabilities: {
        ...browserHost.capabilities,
        previewWebview: true,
      },
      preview: {
        ...browserHost.preview,
        open,
        setBounds,
        message,
      },
    }

    const { previewBridge } = await import('./previewBridge')
    const bounds: WebviewBounds = { x: 1, y: 2, width: 3, height: 4 }

    await previewBridge.open('http://localhost/a', bounds)
    await previewBridge.setBounds(bounds)
    await previewBridge.message({ v: 1, type: 'enter-picker' })

    expect(open).toHaveBeenCalledWith('http://localhost/a', bounds)
    expect(setBounds).toHaveBeenCalledWith(bounds)
    expect(message).toHaveBeenCalledWith({ v: 1, type: 'enter-picker' })
    expect(invoke).not.toHaveBeenCalled()
  })
})
