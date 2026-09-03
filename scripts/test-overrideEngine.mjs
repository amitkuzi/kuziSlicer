// Self-check for the three-layer settings override resolver — no test framework, just assert.
// Run: node scripts/test-overrideEngine.mjs
import assert from 'node:assert/strict'
import path from 'node:path'
import esbuild from 'esbuild'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const result = await esbuild.build({
  entryPoints: [path.resolve('src/main/services/engines/overrideEngine.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
})

const mod = { exports: {} }
new Function('module', 'exports', 'require', result.outputFiles[0].text)(mod, mod.exports, require)
const { resolveOverrides } = mod.exports

const global = { layerHeight: 0.2, infillDensity: 20, shellThickness: 1.2, supportEnabled: false, fanSpeed: 100 }

// 1. No overrides → global wins as-is.
assert.deepEqual(resolveOverrides({ global }), global, 'no overrides should return global unchanged')

// 2. Object override applies on top of global; unset fields fall back to global.
const objectOverride = { infillDensity: 40 }
assert.deepEqual(
  resolveOverrides({ global, object: objectOverride }),
  { ...global, infillDensity: 40 },
  'object override should win over global, other fields fall back'
)

// 3. Part override wins over object override, which wins over global.
const partOverride = { infillDensity: 80, supportEnabled: true }
assert.deepEqual(
  resolveOverrides({ global, object: objectOverride, part: partOverride }),
  { ...global, infillDensity: 80, supportEnabled: true },
  'part override must win over object and global'
)

console.log('PASS: overrideEngine three-layer priority')
