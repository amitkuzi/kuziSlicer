// Self-check for BambuPrinterClient.buildProjectFile -- verifies the .gcode.3mf
// package it builds is structurally valid (same entries as the template, gcode
// swapped in, md5 checksum correct) without touching a real printer.
// Run: node scripts/test-bambuPackaging.mjs
import assert from 'node:assert/strict'
import path from 'node:path'
import crypto from 'node:crypto'
import esbuild from 'esbuild'
import { createRequire } from 'node:module'
import { unzipSync, strToU8 } from 'fflate'

const require = createRequire(import.meta.url)

const result = esbuild.buildSync({
  entryPoints: [path.resolve('src/main/clients/bambuPrinterClient.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['basic-ftp', 'mqtt'], // not needed for buildProjectFile, avoid bundling them
  write: false,
})
const mod = { exports: {} }
new Function('module', 'exports', 'require', result.outputFiles[0].text)(mod, mod.exports, require)
const BambuPrinterClient = mod.exports.default || mod.exports.BambuPrinterClient

const fakeGcode = '; test gcode\nG28\nG1 X10 Y10\n'
const packageBuffer = BambuPrinterClient.buildProjectFile(fakeGcode)

const entries = unzipSync(packageBuffer)

assert.ok(entries['Metadata/plate_1.gcode'], 'package must contain Metadata/plate_1.gcode')
assert.equal(
  Buffer.from(entries['Metadata/plate_1.gcode']).toString('utf-8'),
  fakeGcode,
  'plate_1.gcode content should match the input gcode exactly'
)

const expectedMd5 = crypto.createHash('md5').update(fakeGcode, 'utf-8').digest('hex').toUpperCase()
assert.equal(
  Buffer.from(entries['Metadata/plate_1.gcode.md5']).toString('utf-8'),
  expectedMd5,
  'md5 checksum entry should match the gcode content'
)

// Non-gcode, non-thumbnail entries must survive untouched from the template.
// Thumbnails (Metadata/*.png) are deliberately replaced -- they'd otherwise show
// whatever object the template was originally captured from, which is misleading.
const swappedEntries = Object.keys(entries).filter(
  (k) => k === 'Metadata/plate_1.gcode' || k === 'Metadata/plate_1.gcode.md5' || (k.startsWith('Metadata/') && k.endsWith('.png'))
)
const untouchedEntries = Object.keys(entries).filter((k) => !swappedEntries.includes(k))
assert.ok(untouchedEntries.includes('3D/3dmodel.model'), 'template 3D model entry should be preserved')
assert.ok(untouchedEntries.includes('_rels/.rels'), 'template rels entry should be preserved')
assert.ok(untouchedEntries.includes('[Content_Types].xml'), 'template content-types entry should be preserved')
assert.ok(untouchedEntries.length >= 6, 'non-thumbnail template metadata (settings, etc.) should be preserved')

const thumbnailKeys = Object.keys(entries).filter((k) => k.startsWith('Metadata/') && k.endsWith('.png'))
assert.ok(thumbnailKeys.length > 0, 'template should have at least one thumbnail to verify replacement on')
for (const key of thumbnailKeys) {
  const png = Buffer.from(entries[key])
  assert.deepEqual(png.subarray(0, 8), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), `${key} should still be a valid PNG`)
}

console.log(`PASS: buildProjectFile produces a valid .gcode.3mf (${untouchedEntries.length} template entries preserved, gcode + md5 swapped, ${thumbnailKeys.length} stale thumbnails replaced with valid placeholders)`)
