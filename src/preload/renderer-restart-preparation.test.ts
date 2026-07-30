import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { prepareRendererForAppRestart } from './renderer-restart-preparation'

describe('prepareRendererForAppRestart', () => {
  it('rejects when the shutdown checkpoint prevents unload', async () => {
    const eventTarget = new EventTarget()
    const started = vi.fn()
    const aborted = vi.fn()
    eventTarget.addEventListener('restart-started', started)
    eventTarget.addEventListener('restart-aborted', aborted)
    eventTarget.addEventListener('beforeunload', (event) => event.preventDefault())

    await expect(
      prepareRendererForAppRestart(eventTarget, {
        startedEventName: 'restart-started',
        abortedEventName: 'restart-aborted'
      })
    ).rejects.toThrow('Renderer shutdown checkpoint was not completed.')

    expect(started).toHaveBeenCalledTimes(1)
    expect(aborted).toHaveBeenCalledTimes(1)
  })
})

describe('preload relaunch wiring', () => {
  it('prepares the renderer before invoking the immediate relaunch IPC', () => {
    const source = readFileSync(join(process.cwd(), 'src/preload/index.ts'), 'utf8')
    const start = source.indexOf('relaunch: async (): Promise<void> => {')
    const end = source.indexOf('restart: async (): Promise<void> => {', start)
    const block = source.slice(start, end)

    expect(start).toBeGreaterThanOrEqual(0)
    expect(block).toContain('await prepareRendererForAppRestart(window, {')
    expect(block.indexOf('prepareRendererForAppRestart')).toBeLessThan(
      block.indexOf("ipcRenderer.invoke('app:relaunch')")
    )
  })
})
