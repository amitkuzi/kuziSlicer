/**
 * Self-check for the slicing + infill core.
 * Bundle+run: npx esbuild <this file> --bundle --platform=node | node
 */
import * as assert from 'assert'
import SliceEngine from './sliceEngine'
import type { StlGeometry } from './stlEngine'
import { scanlineFill, getPattern, spacingForDensity, PATTERNS } from './infill'

/** Axis-aligned box mesh (12 triangles), corner at origin. */
function box(w: number, d: number, h: number): StlGeometry {
  const v = (x: number, y: number, z: number) => [x, y, z]
  const quad = (a: number[], b: number[], c: number[], d2: number[]) => [a, b, c, a, c, d2]
  const p = [
    v(0, 0, 0), v(w, 0, 0), v(w, d, 0), v(0, d, 0),
    v(0, 0, h), v(w, 0, h), v(w, d, h), v(0, d, h),
  ]
  const vertices = [
    ...quad(p[0], p[3], p[2], p[1]), // bottom
    ...quad(p[4], p[5], p[6], p[7]), // top
    ...quad(p[0], p[1], p[5], p[4]),
    ...quad(p[1], p[2], p[6], p[5]),
    ...quad(p[2], p[3], p[7], p[6]),
    ...quad(p[3], p[0], p[4], p[7]),
  ]
  return { vertices, bounds: { min: [0, 0, 0], max: [w, d, h] } }
}

// --- slicing -------------------------------------------------------------
const layers = SliceEngine.sliceMesh(box(10, 10, 2), 0.2)
assert.strictEqual(layers.length, 10, 'a 2mm box at 0.2mm should be 10 layers')
for (const layer of layers) {
  assert.strictEqual(layer.contours.length, 1, `layer at z=${layer.z} should have exactly one loop`)
  assert.strictEqual(layer.contours[0].length, 4, 'a box cross-section is a quad')
}

// Cross-section must be the real 10x10 square, not a bounding box guess.
const square = layers[0].contours[0]
const xs = square.map((p) => p.x)
const ys = square.map((p) => p.y)
assert.deepStrictEqual([Math.min(...xs), Math.max(...xs)], [0, 10])
assert.deepStrictEqual([Math.min(...ys), Math.max(...ys)], [0, 10])

// A hollow shape must produce two loops (outer + hole), proving hole handling.
const outer = box(20, 20, 1)
const innerHole = box(10, 10, 1)
// shift the inner box to sit inside the outer one, wound the same way -- even-odd
// treats the second loop as a hole regardless of winding.
const shifted = innerHole.vertices.map((p) => [p[0] + 5, p[1] + 5, p[2]])
const withHole: StlGeometry = {
  vertices: [...outer.vertices, ...shifted],
  bounds: outer.bounds,
}
const holeLayer = SliceEngine.sliceMesh(withHole, 0.5)[0]
assert.strictEqual(holeLayer.contours.length, 2, 'outer wall + hole = 2 loops')

// --- offsetting ----------------------------------------------------------
// The sign convention has to shrink, not grow, or every printed part comes out
// oversized -- assert on a known square.
const inset = SliceEngine.offsetContour(square, 1)
const ix = inset.map((p) => p.x)
const iy = inset.map((p) => p.y)
assert.ok(Math.min(...ix) > 0.9 && Math.min(...ix) < 1.1, `inset minX should be ~1, got ${Math.min(...ix)}`)
assert.ok(Math.max(...ix) > 8.9 && Math.max(...ix) < 9.1, `inset maxX should be ~9, got ${Math.max(...ix)}`)
assert.ok(Math.min(...iy) > 0.9 && Math.min(...iy) < 1.1)
assert.ok(Math.max(...iy) > 8.9 && Math.max(...iy) < 9.1)

// --- infill --------------------------------------------------------------
assert.strictEqual(spacingForDensity(0.4, 100), 0.4)
assert.strictEqual(spacingForDensity(0.4, 20), 2)
assert.strictEqual(spacingForDensity(0.4, 0), 0)

const filled = scanlineFill([square], 1, 0)
assert.ok(filled.length >= 8, `expected several fill lines, got ${filled.length}`)
for (const [a, b] of filled) {
  for (const p of [a, b]) {
    assert.ok(p.x >= -1e-6 && p.x <= 10 + 1e-6, `fill escaped the outline in x: ${p.x}`)
    assert.ok(p.y >= -1e-6 && p.y <= 10 + 1e-6, `fill escaped the outline in y: ${p.y}`)
  }
}

// Denser infill must produce more line, not less.
const sparse = scanlineFill([square], 4, 0).length
const dense = scanlineFill([square], 1, 0).length
assert.ok(dense > sparse, 'smaller spacing must yield more infill lines')

// Fill must respect holes: nothing may land inside the hole region.
const donut = [
  [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }],
  [{ x: 5, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 15 }, { x: 5, y: 15 }],
]
for (const [a, b] of scanlineFill(donut, 1, 0)) {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const inHole = mid.x > 5.1 && mid.x < 14.9 && mid.y > 5.1 && mid.y < 14.9
  assert.ok(!inHole, `infill crossed into the hole at ${mid.x},${mid.y}`)
}

// Every registered pattern must produce something inside a plain square.
for (const pattern of PATTERNS) {
  const out = pattern.generate({ contours: [square], spacing: 1, layerIndex: 0 })
  assert.ok(out.length > 0, `pattern ${pattern.id} produced no infill`)
}
assert.strictEqual(getPattern('nope').id, 'grid', 'unknown pattern falls back to grid')

console.log(`sliceEngine + infill: OK (${PATTERNS.length} patterns)`)
