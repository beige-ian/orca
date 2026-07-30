import { ipcMain } from 'electron'
import { parseExecutionHostId, type ExecutionHostId } from '../../shared/execution-host'
import type { WorkspaceSessionState } from '../../shared/types'
import type { Store } from '../persistence'

const RENDERER_SHUTDOWN_CHECKPOINT_CHANNEL = 'app:persist-before-unload-sync'
const MAX_RENDERER_SHUTDOWN_SESSION_PARTITIONS = 128
let trustedRendererShutdownCheckpointWebContentsId: number | null = null

type PersistBeforeUnloadSyncArgs = {
  sessions: { state: WorkspaceSessionState; hostId?: ExecutionHostId }[]
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isWorkspaceSessionCheckpoint(value: unknown): value is WorkspaceSessionState {
  if (!isPlainRecord(value)) {
    return false
  }
  return (
    isNullableString(value.activeRepoId) &&
    isNullableString(value.activeWorktreeId) &&
    isNullableString(value.activeTabId) &&
    isPlainRecord(value.tabsByWorktree) &&
    isPlainRecord(value.terminalLayoutsByTabId)
  )
}

function isExecutionHostId(value: unknown): value is ExecutionHostId | undefined {
  return (
    value === undefined || (typeof value === 'string' && parseExecutionHostId(value)?.id === value)
  )
}

function isPersistBeforeUnloadSyncArgs(value: unknown): value is PersistBeforeUnloadSyncArgs {
  if (!isPlainRecord(value) || !Array.isArray(value.sessions)) {
    return false
  }
  if (value.sessions.length > MAX_RENDERER_SHUTDOWN_SESSION_PARTITIONS) {
    return false
  }
  return value.sessions.every(
    (session) =>
      isPlainRecord(session) &&
      isWorkspaceSessionCheckpoint(session.state) &&
      isExecutionHostId(session.hostId)
  )
}

function isTrustedRendererSender(
  sender: Electron.WebContents | undefined,
  trustedRendererWebContentsId: number | null
): boolean {
  return Boolean(
    sender &&
    !sender.isDestroyed() &&
    sender.getType() === 'window' &&
    sender.id === trustedRendererWebContentsId
  )
}

export function setTrustedRendererShutdownCheckpointWebContentsId(
  webContentsId: number | null
): void {
  trustedRendererShutdownCheckpointWebContentsId = webContentsId
}

export function registerRendererShutdownCheckpointHandler(
  store: Store,
  trustedRendererWebContentsId: number | null = null
): void {
  setTrustedRendererShutdownCheckpointWebContentsId(trustedRendererWebContentsId)
  ipcMain.removeAllListeners(RENDERER_SHUTDOWN_CHECKPOINT_CHANNEL)
  ipcMain.on(RENDERER_SHUTDOWN_CHECKPOINT_CHANNEL, (event, args: unknown) => {
    if (!isTrustedRendererSender(event.sender, trustedRendererShutdownCheckpointWebContentsId)) {
      event.returnValue = { ok: false }
      return
    }
    if (!isPersistBeforeUnloadSyncArgs(args)) {
      event.returnValue = { ok: false }
      return
    }

    let ok = true
    try {
      for (const { state, hostId } of args.sessions) {
        store.setWorkspaceSession(state, hostId)
      }
    } catch (error) {
      console.error('[app] Failed to stage renderer state before unload:', error)
      ok = false
    }

    try {
      store.flushOrThrow()
    } catch (error) {
      console.error('[app] Failed to flush renderer state before unload:', error)
      ok = false
    }

    event.returnValue = { ok }
  })
}
