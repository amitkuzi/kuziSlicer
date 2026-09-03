// Self-check for PluginManager enable/disable gating — no test framework, just assert.
// Run: node scripts/test-pluginManager.mjs
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import esbuild from 'esbuild'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

// electron isn't available outside Electron; stub app.getPath for the constructor.
const electronStubCode = `module.exports = { app: { getPath: () => ${JSON.stringify(os.tmpdir())} } }`

const result = await esbuild.build({
  entryPoints: [path.resolve('src/main/services/pluginManager.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  plugins: [
    {
      name: 'electron-stub',
      setup(build) {
        build.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'stub' }))
        build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: electronStubCode, loader: 'js' }))
      },
    },
  ],
})

const code = result.outputFiles[0].text
const mod = { exports: {} }
new Function('module', 'exports', 'require', code)(mod, mod.exports, require)
const { PluginManager } = mod.exports

// Fake host client — records calls, never actually spawns anything.
const calls = []
const fakeHostClient = {
  invokePlugin: async (id, req) => { calls.push(['invoke', id]); return { ok: true } },
  streamPluginProgress: async (id, req, onProgress) => { calls.push(['stream', id]); return { ok: true } },
}

const pm = new PluginManager(fakeHostClient)
const pluginId = 'dummy@1.0.0'
pm.plugins.set(pluginId, {
  id: pluginId,
  manifest: { name: 'dummy', version: '1.0.0' },
  enabled: true,
  path: '/tmp/dummy',
})

// 1. Enabled plugin: invoke reaches the host client.
await pm.invokePlugin(pluginId, {})
assert.deepEqual(calls, [['invoke', pluginId]], 'enabled plugin should reach host client')

// 2. Disable → invoke must fail before touching the host client (this IS the "unload" — no
//    persistent per-process state on the host side to separately tear down).
pm.setPluginEnabled(pluginId, false)
await assert.rejects(() => pm.invokePlugin(pluginId, {}), /disabled/, 'disabled plugin must reject invoke')
await assert.rejects(() => pm.streamPlugin(pluginId, {}, () => {}), /disabled/, 'disabled plugin must reject stream')
assert.equal(calls.length, 1, 'host client must not be called for a disabled plugin')

// 3. Re-enable (simulates hot-reload) → invoke works again, no crash, no leaked state.
pm.setPluginEnabled(pluginId, true)
await pm.invokePlugin(pluginId, {})
assert.equal(calls.length, 2, 'plugin should invoke again after re-enable')

console.log('PASS: pluginManager enable/disable gating')
