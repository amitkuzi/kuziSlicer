import assert from 'node:assert/strict'
import path from 'node:path'
import { createRequire } from 'node:module'
import esbuild from 'esbuild'

const require = createRequire(import.meta.url)
const built = esbuild.buildSync({ entryPoints: [path.resolve('src/printer-extensions/registry.ts')],
  bundle: true, platform: 'node', format: 'cjs', external: ['mqtt', 'basic-ftp'], write: false })
const mod = { exports: {} }
new Function('module', 'exports', 'require', built.outputFiles[0].text)(mod, mod.exports, require)
const { PrinterExtensionRegistry, printerExtensions } = mod.exports
const original = printerExtensions.get('bambulab-a1-mini')
const copy = () => ({ ...original, manifest: { ...original.manifest }, profiles: original.profiles.map(p => ({ ...p })) })
let passed = 0
function test(name, action) { action(); passed++; console.log(`PASS: ${name}`) }
test('Registry_StockProfiles_ContainAllRequestedNozzles', () => {
  assert.equal(original.manifest.type, 'rapid printer extension')
  assert.deepEqual(original.profiles.map(p => p.nozzleSize).sort(), [0.2, 0.4, 0.6])
  assert.equal(new Set(original.profiles.map(p => p.id)).size, 3)
  for (const p of original.profiles) assert.deepEqual([p.bedSizeX, p.bedSizeY, p.bedSizeZ, p.maxTemp, p.maxBedTemp], [180, 180, 180, 300, 80])
})
test('Registry_InvalidManifests_Reject', () => {
  for (const override of [{ type: 'printer extension' }, { apiVersion: 2 }, { name: '../escape' }, { version: 'broken' }]) {
    const candidate = copy()
    Object.assign(candidate.manifest, override)
    assert.throws(() => new PrinterExtensionRegistry().register(candidate), /Invalid printer extension manifest/)
  }
})
test('Registry_DuplicateExtension_Rejects', () => {
  const registry = new PrinterExtensionRegistry()
  registry.register(copy())
  assert.throws(() => registry.register(copy()), /Duplicate printer extension/)
})
test('Registry_DuplicateProfileAcrossExtensions_Rejects', () => {
  const registry = new PrinterExtensionRegistry(), other = copy()
  other.manifest.name = 'another-printer'
  registry.register(copy())
  assert.throws(() => registry.register(other), /Duplicate printer profile/)
})
test('Registry_DuplicateProfileWithinExtension_Rejects', () => {
  const candidate = copy()
  candidate.profiles[1].id = candidate.profiles[0].id
  assert.throws(() => new PrinterExtensionRegistry().register(candidate), /Duplicate printer profile/)
})
test('Registry_InvalidProfile_Rejects', () => {
  for (const value of [0, -1, NaN, Infinity]) {
    const candidate = copy()
    candidate.profiles[0].bedSizeX = value
    assert.throws(() => new PrinterExtensionRegistry().register(candidate), /Invalid printer profile/)
  }
})
test('Registry_UnknownExtension_Rejects', () => {
  assert.throws(() => new PrinterExtensionRegistry().get('missing'), /Unknown printer extension/)
})
test('Registry_IncompleteExtension_Rejects', () => {
  for (const override of [{ prepare: undefined }, { connect: undefined }, { profiles: [] }]) {
    assert.throws(() => new PrinterExtensionRegistry().register({ ...copy(), ...override }), /Incomplete printer extension/)
  }
})
console.log(`PASS: ${passed} independent registry cases`)
