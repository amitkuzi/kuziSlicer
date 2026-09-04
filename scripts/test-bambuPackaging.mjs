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

// Everything else must survive untouched from the template
const untouchedEntries = Object.keys(entries).filter(
  (k) => k !== 'Metadata/plate_1.gcode' && k !== 'Metadata/plate_1.gcode.md5'
)
assert.ok(untouchedEntries.includes('3D/3dmodel.model'), 'template 3D model entry should be preserved')
assert.ok(untouchedEntries.includes('_rels/.rels'), 'template rels entry should be preserved')
assert.ok(untouchedEntries.includes('[Content_Types].xml'), 'template content-types entry should be preserved')
assert.ok(untouchedEntries.length >= 10, 'template metadata (thumbnails, settings, etc.) should be preserved')

console.log(`PASS: buildProjectFile produces a valid .gcode.3mf (${untouchedEntries.length} template entries preserved, gcode + md5 swapped correctly)`)
