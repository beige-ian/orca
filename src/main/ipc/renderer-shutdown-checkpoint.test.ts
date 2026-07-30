import { beforeEach, describe, expect, it, vi } from 'vitest'

const { syncHandlers } = vi.hoisted(() => ({
  syncHandlers: new Map<
    string,
    (event: { returnValue?: unknown; sender?: unknown }, args: unknown) => void
  >()
}))

vi.mock('electron', () => ({
  ipcMain: {
    removeAllListeners: vi.fn(),
    on: vi.fn(
      (
        channel: string,
        handler: (event: { returnValue?: unknown; sender?: unknown }, args: unknown) => void
      ) => {
        syncHandlers.set(channel, handler)
      }
    )
  }
}))

import {
  registerRendererShutdownCheckpointHandler,
  setTrustedRendererShutdownCheckpointWebContentsId
} from './renderer-shutdown-checkpoint'

describe('registerRendererShutdownCheckpointHandler', () => {
  beforeEach(() => {
    syncHandlers.clear()
  })

  const makeSession = (activeWorktreeId: string) => ({
    activeRepoId: null,
    activeWorktreeId,
    activeTabId: null,
    tabsByWorktree: {},
    terminalLayoutsByTabId: {}
  })

  const makeRendererEvent = (id = 42): { returnValue?: unknown; sender: unknown } => ({
    sender: { id, isDestroyed: () => false, getType: () => 'window' }
  })

  it('stages every host session before the synchronous durable flush', () => {
    const callOrder: string[] = []
    const store = {
      setWorkspaceSession: vi.fn((_state, hostId?: string) => {
        callOrder.push(`session:${hostId ?? 'local'}`)
      }),
      flushOrThrow: vi.fn(() => callOrder.push('flush'))
    }
    registerRendererShutdownCheckpointHandler(store as never, 42)

    const handler = syncHandlers.get('app:persist-before-unload-sync')
    expect(handler).toBeDefined()
    const event = makeRendererEvent()
    const localSession = makeSession('local-worktree')
    const remoteSession = makeSession('remote-worktree')
    handler?.(event, {
      sessions: [{ state: localSession }, { state: remoteSession, hostId: 'runtime:host-1' }]
    })

    expect(store.setWorkspaceSession).toHaveBeenNthCalledWith(1, localSession, undefined)
    expect(store.setWorkspaceSession).toHaveBeenNthCalledWith(2, remoteSession, 'runtime:host-1')
    expect(store.flushOrThrow).toHaveBeenCalledTimes(1)
    expect(callOrder).toEqual(['session:local', 'session:runtime:host-1', 'flush'])
    expect(event.returnValue).toEqual({ ok: true })
  })

  it('reports staging and flush failures so the renderer can retry', () => {
    const store = {
      setWorkspaceSession: vi.fn(() => {
        throw new Error('invalid session')
      }),
      flushOrThrow: vi.fn(() => {
        throw new Error('disk full')
      })
    }
    registerRendererShutdownCheckpointHandler(store as never, 42)

    const handler = syncHandlers.get('app:persist-before-unload-sync')
    const event = makeRendererEvent()
    handler?.(event, { sessions: [{ state: makeSession('worktree-1') }] })

    expect(store.flushOrThrow).toHaveBeenCalledTimes(1)
    expect(event.returnValue).toEqual({ ok: false })
  })

  it('rejects malformed or unbounded checkpoints before touching persistence', () => {
    const store = {
      setWorkspaceSession: vi.fn(),
      flushOrThrow: vi.fn()
    }
    registerRendererShutdownCheckpointHandler(store as never, 42)

    const handler = syncHandlers.get('app:persist-before-unload-sync')
    const event = makeRendererEvent()
    handler?.(event, { sessions: 'not-an-array' })

    expect(store.setWorkspaceSession).not.toHaveBeenCalled()
    expect(store.flushOrThrow).not.toHaveBeenCalled()
    expect(event.returnValue).toEqual({ ok: false })

    const tooManySessions = Array.from({ length: 129 }, (_, index) => ({
      state: makeSession(`worktree-${index}`)
    }))
    handler?.(event, { sessions: tooManySessions })

    expect(store.setWorkspaceSession).not.toHaveBeenCalled()
    expect(store.flushOrThrow).not.toHaveBeenCalled()
    expect(event.returnValue).toEqual({ ok: false })
  })

  it('accepts checkpoints only from the registered main renderer', () => {
    const store = {
      setWorkspaceSession: vi.fn(),
      flushOrThrow: vi.fn()
    }
    registerRendererShutdownCheckpointHandler(store as never, 42)

    const handler = syncHandlers.get('app:persist-before-unload-sync')
    const rejectedEvent = makeRendererEvent(41)
    handler?.(rejectedEvent, { sessions: [{ state: makeSession('worktree-1') }] })

    expect(store.setWorkspaceSession).not.toHaveBeenCalled()
    expect(store.flushOrThrow).not.toHaveBeenCalled()
    expect(rejectedEvent.returnValue).toEqual({ ok: false })

    const acceptedEvent = makeRendererEvent()
    handler?.(acceptedEvent, { sessions: [{ state: makeSession('worktree-1') }] })

    expect(store.setWorkspaceSession).toHaveBeenCalledTimes(1)
    expect(store.flushOrThrow).toHaveBeenCalledTimes(1)
    expect(acceptedEvent.returnValue).toEqual({ ok: true })
  })

  it('uses the latest main renderer id when the app recreates its window', () => {
    const store = {
      setWorkspaceSession: vi.fn(),
      flushOrThrow: vi.fn()
    }
    registerRendererShutdownCheckpointHandler(store as never, 42)
    setTrustedRendererShutdownCheckpointWebContentsId(43)

    const handler = syncHandlers.get('app:persist-before-unload-sync')
    const event = makeRendererEvent(43)
    handler?.(event, { sessions: [{ state: makeSession('worktree-1') }] })

    expect(store.setWorkspaceSession).toHaveBeenCalledTimes(1)
    expect(store.flushOrThrow).toHaveBeenCalledTimes(1)
    expect(event.returnValue).toEqual({ ok: true })
  })
})
