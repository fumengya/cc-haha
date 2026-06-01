import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MenuItemConstructorOptions } from 'electron'
import { ELECTRON_EVENT_CHANNELS } from '../ipc/channels'
import { buildApplicationMenuTemplate, installApplicationMenu } from './menu'

const menuMocksKey = '__electronMenuMocks'

function createElectronMenuMocks() {
  return {
    buildFromTemplate: vi.fn((template: unknown) => ({ template })),
    setApplicationMenu: vi.fn(),
  }
}

function getElectronMenuMocks() {
  const store = globalThis as Record<string, unknown>
  const existing = store[menuMocksKey] as ReturnType<typeof createElectronMenuMocks> | undefined
  if (existing) return existing
  const created = createElectronMenuMocks()
  store[menuMocksKey] = created
  return created
}

vi.mock('electron', () => {
  const mocks = getElectronMenuMocks()
  return {
    Menu: {
      buildFromTemplate: mocks.buildFromTemplate,
      setApplicationMenu: mocks.setApplicationMenu,
    },
  }
})

describe('Electron application menu service', () => {
  afterEach(() => {
    const mocks = getElectronMenuMocks()
    mocks.buildFromTemplate.mockClear()
    mocks.setApplicationMenu.mockClear()
  })

  it('emits native navigation destinations from macOS app menu items', () => {
    const onNavigate = vi.fn()
    const template = buildApplicationMenuTemplate('Claude Code Haha', onNavigate, 'darwin')
    const appMenu = template[0]
    expect(appMenu).toBeDefined()
    const submenu = appMenu!.submenu as MenuItemConstructorOptions[]

    const aboutItem = submenu[0]
    const settingsItem = submenu[2]
    expect(aboutItem).toBeDefined()
    expect(settingsItem).toBeDefined()
    aboutItem!.click?.({} as never, {} as never, {} as never)
    settingsItem!.click?.({} as never, {} as never, {} as never)

    expect(onNavigate).toHaveBeenNthCalledWith(1, 'about')
    expect(onNavigate).toHaveBeenNthCalledWith(2, 'settings')
  })

  it('keeps a settings entry available on non-macOS platforms', () => {
    const template = buildApplicationMenuTemplate('Claude Code Haha', vi.fn(), 'win32')
    const fileMenu = template[0]
    expect(fileMenu).toBeDefined()
    const fileSubmenu = fileMenu!.submenu as MenuItemConstructorOptions[]

    expect(fileSubmenu.some(item => item.label === 'Settings...')).toBe(true)
  })

  it('installs a native menu that forwards settings navigation to the renderer event channel', async () => {
    const menuMocks = getElectronMenuMocks()
    menuMocks.buildFromTemplate.mockClear()
    menuMocks.setApplicationMenu.mockClear()
    const send = vi.fn()

    await installApplicationMenu(
      { name: 'Claude Code Haha' } as never,
      () => ({ webContents: { send } }) as never,
    )

    expect(menuMocks.buildFromTemplate).toHaveBeenCalledTimes(1)
    expect(menuMocks.setApplicationMenu).toHaveBeenCalledWith({
      template: menuMocks.buildFromTemplate.mock.calls[0]?.[0],
    })

    const template = menuMocks.buildFromTemplate.mock.calls[0]?.[0] as MenuItemConstructorOptions[]
    const settingsItem = template
      .flatMap(item => (item.submenu as MenuItemConstructorOptions[] | undefined) ?? [])
      .find(item => item.label === 'Settings...')

    expect(settingsItem).toBeDefined()
    settingsItem?.click?.({} as never, {} as never, {} as never)
    expect(send).toHaveBeenCalledWith(ELECTRON_EVENT_CHANNELS.nativeMenuNavigate, 'settings')
  })
})
