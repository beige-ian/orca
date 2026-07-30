import { describe, expect, it, vi } from 'vitest'
import {
  createShutdownCheckpointBeforeUnloadHandler,
  createShutdownCheckpointGuard
} from './shutdown-checkpoint-guard'

describe('createShutdownCheckpointGuard', () => {
  it('deduplicates synthetic and native unload events', () => {
    const persist = vi.fn()
    const guard = createShutdownCheckpointGuard(persist)

    expect(guard.persistOnce()).toBe(true)
    expect(guard.persistOnce()).toBe(true)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('keeps a failed checkpoint retryable and resets after an aborted attempt', () => {
    const persist = vi.fn().mockImplementationOnce(() => {
      throw new Error('disk full')
    })
    const guard = createShutdownCheckpointGuard(persist)
    const handler = createShutdownCheckpointBeforeUnloadHandler(guard)

    const first = new Event('beforeunload', { cancelable: true })
    handler(first)
    expect(first.defaultPrevented).toBe(true)

    const second = new Event('beforeunload', { cancelable: true })
    handler(second)
    expect(second.defaultPrevented).toBe(false)

    guard.reset()
    expect(guard.persistOnce()).toBe(true)
    expect(persist).toHaveBeenCalledTimes(3)
  })
})
