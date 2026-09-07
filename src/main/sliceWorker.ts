/**
 * Runs a slice off the Electron main thread. Slicing a real mesh is seconds-to-minutes of
 * pure CPU; doing it inline froze the whole app (no IPC, no window redraw) until it finished.
 * The G-code is written here rather than posted back -- a big job's output is too large to clone.
 */
import * as fs from 'fs'
import { parentPort, workerData } from 'worker_threads'
import { sliceLocally, LocalSliceOptions } from './services/localSlicer'

const port = parentPort
if (!port) throw new Error('sliceWorker must be run as a worker_thread')

const { outputPath, ...options } = workerData as LocalSliceOptions & { outputPath: string }

try {
  const gcode = sliceLocally(options, (done, total) => port.postMessage({ type: 'progress', done, total }))
  fs.writeFileSync(outputPath, gcode)
  port.postMessage({ type: 'done' })
} catch (err) {
  port.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) })
}
// parentPort keeps the thread alive; the work is done, so let it go.
port.close()
