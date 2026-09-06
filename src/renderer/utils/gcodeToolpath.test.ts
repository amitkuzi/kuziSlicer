/**
 * Self-check for the G-code → toolpath parser that feeds the print path preview.
 * Run via: npm run test:engines
 */
import * as assert from 'assert'
import { parseGcodeToolpath } from './gcodeToolpath'

const gcode = [
  'G21', 'G90', 'M83', 'G28', 'G92 E0',
  'G1 Z0.2 F600',
  ';TYPE:WALL-OUTER',
  'G0 X10 Y10 F9000',
  'G1 X20 Y10 E0.5 F1200',
  'G1 X20 Y20 E0.5 F1200',
  'G1 E-0.8 F2100', // retraction: no movement, must draw nothing
  ';TYPE:FILL',
  'G1 Z0.4 F600',
  'G0 X10 Y10 F9000',
  'G1 X20 Y20 E0.7 F1200',
].join('\n')

const t = parseGcodeToolpath(gcode)

assert.strictEqual(t.extrudePositions.length / 6, 3, 'expected 3 extrusion segments')
// 2 XY travels + 2 Z-only layer changes, all non-extruding moves
assert.strictEqual(t.travelPositions.length / 6, 4, 'expected 4 travel segments')
assert.strictEqual(t.extrudeColors.length, t.extrudePositions.length, 'one colour per vertex')

assert.strictEqual(t.layers.length, 2, `expected 2 layers, got ${t.layers.length}`)
assert.deepStrictEqual(t.layers.map((l) => l.z), [0.2, 0.4])

// The layer slider is a setDrawRange crop, so offsets must be cumulative and growing.
assert.strictEqual(t.layers[0].extrudeEnd, 4, 'layer 1 = 2 segments = 4 vertices')
assert.strictEqual(t.layers[1].extrudeEnd, 6, 'layer 2 adds 1 segment')
assert.ok(t.layers[0].extrudeEnd > 0, 'the first slider position must show real geometry')

// Feature colouring: walls warm, fill green.
assert.ok(t.extrudeColors[0] > t.extrudeColors[2], 'wall-outer should be orange (r > b)')
const last = t.extrudeColors.length - 3
assert.ok(t.extrudeColors[last + 1] > t.extrudeColors[last], 'fill should be green (g > r)')

assert.deepStrictEqual(t.bounds!.max, [20, 20, 0.4])
assert.ok(!Array.from(t.extrudePositions).some(Number.isNaN), 'no NaN vertices')

// Absolute extrusion (M82) must treat a decreasing E as a retraction, not a line.
const absolute = parseGcodeToolpath(
  ['M82', 'G1 Z0.2', 'G1 X0 Y0 E0', 'G1 X10 Y0 E1', 'G1 X20 Y0 E0.5'].join('\n')
)
assert.strictEqual(absolute.extrudePositions.length / 6, 1, 'retraction in absolute mode must not draw')

// Trailing comments must not break parameter parsing.
const commented = parseGcodeToolpath(['M83', 'G1 Z0.2', 'G1 X5 Y5 E1 ; first move'].join('\n'))
assert.strictEqual(commented.extrudePositions.length / 6, 1, 'trailing comments must still parse')

assert.strictEqual(parseGcodeToolpath('').layers.length, 0, 'empty input yields no layers')

console.log('gcodeToolpath: OK')
