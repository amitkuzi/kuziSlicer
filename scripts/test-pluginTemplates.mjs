// SPDX-License-Identifier: GPL-3.0-or-later
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import esbuild from 'esbuild'

const require = createRequire(import.meta.url)
const built = esbuild.buildSync({
  entryPoints: [path.resolve('src/types/plugin-manifest.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
})
const module = { exports: {} }
new Function('module', 'exports', 'require', built.outputFiles[0].text)(module, module.exports, require)
const { validateManifest } = module.exports

const manifests = [
  'src/plugins/PluginHost/templates/engine/manifest.json',
  'src/plugins/PluginHost/templates/importer/manifest.json',
  'src/plugins/PluginHost/templates/exporter/manifest.json',
  'src/plugins/PluginHost/templates/tool/manifest.json',
  'src/printer-extensions/template/manifest.json',
]

for (const filename of manifests) {
  const manifest = JSON.parse(await readFile(filename, 'utf8'))
  assert.equal(validateManifest(manifest), true, `${filename} must satisfy PluginManifest`)
  assert.equal(manifest.license, 'GPL-3.0-or-later')
  console.log(`PASS ${manifest.type}: ${filename}`)
}
