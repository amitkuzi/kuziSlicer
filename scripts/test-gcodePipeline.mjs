// Self-check for the STL -> G-code pipeline (the actual "can I print" path) --
// no test framework, just assert. Bundles stlEngine + gcodeEngine (both pure,
// no Electron dependency) and runs them against a synthetic binary STL.
// Run: node scripts/test-gcodePipeline.mjs
import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import esbuild from 'esbuild'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

function loadModule(entry, exportNames) {
  const result = esbuild.buildSync({
    entryPoints: [path.resolve(entry)],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
  })
  const mod = { exports: {} }
  new Function('module', 'exports', 'require', result.outputFiles[0].text)(mod, mod.exports, require)
  return exportNames.length === 1 ? mod.exports[exportNames[0]] : exportNames.map((n) => mod.exports[n])
}

const StlEngine = loadModule('src/main/services/engines/stlEngine.ts', ['StlEngine'])
const GcodeEngine = loadModule('src/main/services/engines/gcodeEngine.ts', ['GcodeEngine'])

// Write a minimal valid binary STL: a single triangle spanning a 10x10x5mm box.
function writeBinaryStl(filePath) {
  const triangles = [
    // normal(3f) + 3x vertex(3f) + attr(2b) = 50 bytes/triangle
    { v: [[0, 0, 0], [10, 0, 0], [0, 10, 5]] },
    { v: [[10, 0, 0], [10, 10, 5], [0, 10, 5]] },
  ]
  const buf = Buffer.alloc(84 + triangles.length * 50)
  buf.write('kuziSlicer test STL'.padEnd(80, ' '), 0, 'ascii')
  buf.writeUInt32LE(triangles.length, 80)
  let offset = 84
  for (const tri of triangles) {
    offset += 12 // normal, left zeroed
    for (const [x, y, z] of tri.v) {
      buf.writeFloatLE(x, offset)
      buf.writeFloatLE(y, offset + 4)
      buf.writeFloatLE(z, offset + 8)
      offset += 12
    }
    offset += 2 // attribute byte count
  }
  fs.writeFileSync(filePath, buf)
}

const tmpStl = path.join(os.tmpdir(), `kuzislicer-test-${Date.now()}.stl`)
writeBinaryStl(tmpStl)

try {
  const geometry = StlEngine.parseStl(tmpStl)
  assert.equal(geometry.vertices.length, 6, 'should parse 2 triangles = 6 vertices')
  assert.deepEqual(geometry.bounds.max, [10, 10, 5], 'bounds should match the synthetic box')

  const printer = {
    id: 'bambulab-a1-mini', name: 'Bambu Lab A1 Mini', nozzleSize: 0.4,
    bedSizeX: 180, bedSizeY: 180, bedSizeZ: 180, maxTemp: 300, maxBedTemp: 80,
    maxSpeed: 500, defaultSpeed: 200, acceleration: 10000,
  }
  const filament = {
    id: 'pla-generic', name: 'PLA (Generic)', material: 'PLA',
    extruderTemp: 200, bedTemp: 60, printSpeed: 50, retractDistance: 5, retractSpeed: 40,
  }
  const settings = { layerHeight: 0.2, infillDensity: 20, shellThickness: 1.2, supportEnabled: false, fanSpeed: 100 }

  const gcode = GcodeEngine.generate({ geometry, printer, filament, settings })

  assert.match(gcode, /M104 S200/, 'should set extruder temp from filament profile')
  assert.match(gcode, /M140 S60/, 'should set bed temp from filament profile')
  assert.match(gcode, /Layer 0 \/ 25/, 'a 5mm model at 0.2mm layers should slice into 25 layers')
  assert.match(gcode, /Bambu Lab A1 Mini/, 'header should name the selected printer')
  assert.match(gcode, /PLA \(Generic\)/, 'header should name the selected filament')

  const time = GcodeEngine.estimatePrintTime(geometry, filament, settings)
  const weight = GcodeEngine.estimateFilamentWeight(geometry, filament, settings)
  assert.ok(time > 0, 'estimated print time should be positive')
  assert.ok(weight > 0, 'estimated filament weight should be positive')

  console.log('PASS: STL -> G-code pipeline produces valid output for a real printer/filament profile')
} finally {
  fs.rmSync(tmpStl, { force: true })
}
