import { browserHost } from './browserHost'
import { tauriHost } from './tauriHost'
import type { DesktopHost } from './types'

export type DesktopHostEnvironment = {
  electronHost: DesktopHost | null
  hasTauri: boolean
  tauriHost?: DesktopHost | null
}

export function detectDesktopHostEnvironment(): DesktopHostEnvironment {
  if (typeof window === 'undefined') {
    return { electronHost: null, hasTauri: false }
  }

  return {
    electronHost: window.desktopHost ?? null,
    hasTauri: '__TAURI_INTERNALS__' in window || '__TAURI__' in window,
  }
}

export function createDesktopHost(
  environment: DesktopHostEnvironment = detectDesktopHostEnvironment(),
): DesktopHost {
  if (environment.electronHost) return environment.electronHost
  if (environment.hasTauri && environment.tauriHost) return environment.tauriHost
  return browserHost
}

export function getDesktopHost(): DesktopHost {
  return createDesktopHost({
    ...detectDesktopHostEnvironment(),
    tauriHost,
  })
}

export const desktopHost = getDesktopHost()

export type * from './types'
