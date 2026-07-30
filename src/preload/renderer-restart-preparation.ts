import {
  ORCA_EDITOR_PREPARE_HOT_EXIT_EVENT,
  type EditorPrepareHotExitDetail
} from '../shared/editor-save-events'

export type AppRestartPrepOptions = {
  startedEventName: string
  abortedEventName: string
}

function requestEditorHotExitBackup(eventTarget: EventTarget): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let claimed = false
    eventTarget.dispatchEvent(
      new CustomEvent<EditorPrepareHotExitDetail>(ORCA_EDITOR_PREPARE_HOT_EXIT_EVENT, {
        detail: {
          claim: () => {
            claimed = true
          },
          resolve,
          reject: (message) => reject(new Error(message))
        }
      })
    )
    if (!claimed) {
      resolve()
    }
  })
}

export async function prepareRendererForAppRestart(
  eventTarget: EventTarget,
  { startedEventName, abortedEventName }: AppRestartPrepOptions
): Promise<void> {
  eventTarget.dispatchEvent(new Event(startedEventName))
  try {
    await requestEditorHotExitBackup(eventTarget)
    const accepted = eventTarget.dispatchEvent(new Event('beforeunload', { cancelable: true }))
    if (!accepted) {
      throw new Error('Renderer shutdown checkpoint was not completed.')
    }
  } catch (error) {
    eventTarget.dispatchEvent(new Event(abortedEventName))
    throw error
  }
}
