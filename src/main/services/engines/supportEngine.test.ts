/**
 * Self-check for overhang detection and support generation.
 * Run via: npm run test:engines
 */
import * as assert from 'assert'
import SliceEngine from './sliceEngine'
import GcodeEngine from './gcodeEngine'
import { generateSupports, DEFAULT_SUPPORT_OPTIONS } from './supportEngine'
import type { StlGeometry } from './stlEngine'

/** Triangles for an axis-aligned box between two corners. */
function boxTriangles(
  x0: number, y0: number, z0: number,
  x1: number, y1: number, z1: number
): number[][] {
  const p = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ]
  const face = (a: number, b: number, c: number, d: number) => [p[a], p[b], p[c], p[a], p[c], p[d]]
  return [
    ...face(0, 3, 2, 1), ...face(4, 5, 6, 7), ...face(0, 1, 5, 4),
    ...face(1, 2, 6, 5), ...face(2, 3, 7, 6), ...face(3, 0, 4, 7),
  ]
}

// A mushroom: a narrow 4x4 pillar carrying a wide 20x20 cap. The cap's rim hangs over
// nothing, which is exactly what supports exist for.
const mushroom: StlGeometry = {
  vertices: [...boxTriangles(8, 8, 0, 12, 12, 5), ...boxTriangles(0, 0, 5, 20, 20, 10)],
  bounds: { min: [0, 0, 0], max: [20, 20, 10] },
}

const layerHeight = 0.2
const layers = SliceEngine.sliceMesh(mushroom, layerHeight)
const supports = generateSupports(layers, { ...DEFAULT_SUPPORT_OPTIONS, layerHeight })

assert.strictEqual(supports.length, layers.length, 'one support entry per layer')

const supportedLayers = supports.filter((s) => s.length > 0).length
assert.ok(supportedLayers > 0, 'an overhanging cap must generate supports')

// Supports belong under the cap (below z=5), never above where the model is solid.
const zOf = (index: number) => layers[index].z
supports.forEach((segments, index) => {
  if (segments.length === 0) return
  assert.ok(zOf(index) < 5, `support generated at z=${zOf(index).toFixed(2)}, above the overhang`)
})

// They must sit under the overhanging rim, not inside the pillar's own footprint.
const allPoints = supports.flat().flat()
assert.ok(allPoints.length > 0, 'supports should have printable geometry')
assert.ok(
  allPoints.some((p) => p.x < 7.5 || p.x > 12.5),
  'supports must reach the overhanging rim outside the pillar'
)
for (const p of allPoints) {
  assert.ok(p.x >= -0.1 && p.x <= 20.1 && p.y >= -0.1 && p.y <= 20.1, 'support escaped the model footprint')
}

// The air gap means the layer directly under the cap stays clear, so it can snap off.
const lastBelowCap = layers.findIndex((l) => l.z > 5) - 1
assert.strictEqual(
  supports[lastBelowCap].length, 0,
  'the layer immediately below the overhang must be left as an air gap'
)

// --- end to end through the G-code engine -------------------------------
const printer: any = {
  name: 'T', nozzleSize: 0.4, bedSizeX: 220, bedSizeY: 220, bedSizeZ: 250,
  maxSpeed: 150, acceleration: 3000,
}
const filament: any = {
  name: 'PLA', material: 'PLA', extruderTemp: 210, bedTemp: 60,
  printSpeed: 50, retractDistance: 0.8, retractSpeed: 35,
}
const base = {
  layerHeight, infillDensity: 15, infillPattern: 'grid',
  shellThickness: 1.2, fanSpeed: 100,
}

const withSupport = GcodeEngine.generate({
  geometry: mushroom, printer, filament, settings: { ...base, supportEnabled: true } as any,
})
const withoutSupport = GcodeEngine.generate({
  geometry: mushroom, printer, filament, settings: { ...base, supportEnabled: false } as any,
})

assert.match(withSupport, /;TYPE:SUPPORT/, 'enabling supports must emit support toolpaths')
assert.doesNotMatch(withoutSupport, /;TYPE:SUPPORT/, 'disabling supports must emit none')
assert.match(withSupport, /; Supports: on/, 'header should record the setting')
assert.ok(
  withSupport.length > withoutSupport.length,
  'support material must add real moves, not just a comment'
)

// A plain box has no overhang anywhere, so the toggle should change nothing.
const solidBox: StlGeometry = {
  vertices: boxTriangles(0, 0, 0, 20, 20, 10),
  bounds: { min: [0, 0, 0], max: [20, 20, 10] },
}
const boxSupports = generateSupports(SliceEngine.sliceMesh(solidBox, layerHeight), {
  ...DEFAULT_SUPPORT_OPTIONS,
  layerHeight,
})
assert.strictEqual(
  boxSupports.filter((s) => s.length > 0).length, 0,
  'a shape with no overhangs must not waste filament on supports'
)

console.log(`supportEngine: OK (${supportedLayers} supported layers under the overhang)`)
