import { describe, expect, it, vi } from 'vitest'
import { acquireSingleInstanceLock } from './singleInstance'

describe('Electron single-instance service', () => {
  it('allows validation runs to bypass the single-instance lock explicitly', () => {
    const app = {
      requestSingleInstanceLock: vi.fn(() => false),
      quit: vi.fn(),
      on: vi.fn(),
    }

    expect(acquireSingleInstanceLock(app as never, () => null, {
      CC_HAHA_ELECTRON_DISABLE_SINGLE_INSTANCE_LOCK: '1',
    })).toBe(true)
    expect(app.requestSingleInstanceLock).not.toHaveBeenCalled()
    expect(app.quit).not.toHaveBeenCalled()
    expect(app.on).not.toHaveBeenCalled()
  })

  it('quits duplicate launches when the lock cannot be acquired', () => {
    const app = {
      requestSingleInstanceLock: vi.fn(() => false),
      quit: vi.fn(),
      on: vi.fn(),
    }

    expect(acquireSingleInstanceLock(app as never, () => null)).toBe(false)
    expect(app.quit).toHaveBeenCalledTimes(1)
    expect(app.on).not.toHaveBeenCalled()
  })

  it('registers a second-instance focus handler after acquiring the lock', () => {
    const app = {
      requestSingleInstanceLock: vi.fn(() => true),
      quit: vi.fn(),
      on: vi.fn(),
    }

    expect(acquireSingleInstanceLock(app as never, () => null)).toBe(true)
    expect(app.on).toHaveBeenCalledWith('second-instance', expect.any(Function))
  })
})
