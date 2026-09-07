// The off-main-thread slice path: the worker must boot, report progress that ends at 100%,
// and write the G-code to disk itself (nothing large crosses the thread boundary).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { build } from 'esbuild'

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'kuzislicer-worker-'))
const workerFile = path.join(work, 'sliceWorker.cjs')
await build({
  entryPoints: [path.resolve('src/main/sliceWorker.ts')],
  bundle: true, platform: 'node', format: 'cjs', outfile: workerFile,
})

// A closed 20x20x10mm box: 50 layers at 0.2mm.
const p = [
  [0, 0, 0], [20, 0, 0], [20, 20, 0], [0, 20, 0],
  [0, 0, 10], [20, 0, 10], [20, 20, 10], [0, 20, 10],
]
const face = (a, b, c, d) => [[p[a], p[b], p[c]], [p[a], p[c], p[d]]]
const tris = [
  ...face(0, 3, 2, 1), ...face(4, 5, 6, 7), ...face(0, 1, 5, 4),
  ...face(1, 2, 6, 5), ...face(2, 3, 7, 6), ...face(3, 0, 4, 7),
]
const buf = Buffer.alloc(84 + tris.length * 50)
buf.writeUInt32LE(tris.length, 80)
let o = 84
for (const t of tris) {
  o += 12
  for (const v of t) {
    buf.writeFloatLE(v[0], o); buf.writeFloatLE(v[1], o + 4); buf.writeFloatLE(v[2], o + 8); o += 12
  }
  o += 2
}
const modelPath = path.join(work, 'box.stl')
fs.writeFileSync(modelPath, buf)

const outputPath = path.join(work, 'out.gcode')
const workerData = {
  modelPath,
  outputPath,
  printerProfile: {
    id: 'bambulab-a1-mini', name: 'Bambu Lab A1 Mini', nozzleSize: 0.4,
    bedSizeX: 180, bedSizeY: 180, bedSizeZ: 180, maxTemp: 300, maxBedTemp: 80,
    maxSpeed: 500, defaultSpeed: 200, acceleration: 10000,
  },
  filamentProfile: {
    id: 'pla-generic', name: 'PLA (Generic)', material: 'PLA',
    extruderTemp: 200, bedTemp: 60, printSpeed: 50, retractDistance: 5, retractSpeed: 40,
  },
  settings: { layerHeight: 0.2, infillDensity: 20, infillPattern: 'grid', shellThickness: 1.2, supportEnabled: false, fanSpeed: 100 },
  transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
}

const run = (data) =>
  new Promise((resolve, reject) => {
    const progress = []
    const worker = new Worker(workerFile, { workerData: data })
    worker.on('message', (msg) => {
      if (msg.type === 'progress') progress.push(msg)
      else resolve({ msg, progress })
    })
    worker.on('error', reject)
  })

try {
  const { msg, progress } = await run(workerData)
  assert.equal(msg.type, 'done', `worker should finish: ${msg.message || ''}`)
  assert.ok(progress.length > 1, `should report progress while slicing, got ${progress.length} events`)
  const last = progress[progress.length - 1]
  assert.equal(last.done, last.total, 'progress must reach 100%, not stop short')
  assert.equal(last.total, 50, `a 10mm box at 0.2mm is 50 layers, got ${last.total}`)
  assert.ok(!('gcode' in msg), 'G-code must not be posted across the thread boundary')

  const gcode = fs.readFileSync(outputPath, 'utf8')
  assert.match(gcode, /; Layer 50\/50/, 'the worker should have written the whole toolpath')
  assert.ok(gcode.length > 10000, `expected a real toolpath, got ${gcode.length} bytes`)

  // A parse failure has to come back as an error message, not a silent hang.
  const bad = await run({ ...workerData, modelPath: path.join(work, 'missing.stl') })
  assert.equal(bad.msg.type, 'error', 'a missing model should report an error')
  assert.match(bad.msg.message, /Failed to parse model/)

  console.log(`PASS: slice worker ran off-thread, reported ${progress.length} progress events to 100%, wrote ${gcode.length} bytes`)
} finally {
  fs.rmSync(work, { recursive: true, force: true })
}
