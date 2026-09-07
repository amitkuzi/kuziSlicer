// A mesh-only .3mf must slice through the official ElegooSlicer CLI with the Centauri Carbon
// profile -- the app offers .3mf in the file picker, so the slicer has to accept it.
// Requires ElegooSlicer installed (same precondition as test:elegooslicer).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import esbuild from 'esbuild'
import { zipSync, strToU8 } from 'fflate'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const built = esbuild.buildSync({ entryPoints: [path.resolve('src/main/services/elegooSlicerService.ts')], bundle: true, platform: 'node', format: 'cjs', write: false })
const mod = { exports: {} }
new Function('module', 'exports', 'require', built.outputFiles[0].text)(mod, mod.exports, require)
const { ElegooSlicerService } = mod.exports

const v = [[0,0,0],[20,0,0],[20,20,0],[0,20,0],[0,0,20],[20,0,20],[20,20,20],[0,20,20]]
const f = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]]
const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
 <resources>
  <object id="1" type="model">
   <mesh>
    <vertices>${v.map(([x,y,z]) => `<vertex x="${x}" y="${y}" z="${z}"/>`).join('')}</vertices>
    <triangles>${f.map(([a,b,c]) => `<triangle v1="${a}" v2="${b}" v3="${c}"/>`).join('')}</triangles>
   </mesh>
  </object>
 </resources>
 <build><item objectid="1"/></build>
</model>`
const zip = zipSync({
  '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`),
  '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`),
  '3D/3dmodel.model': strToU8(model),
})

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'kuzi-3mf-'))
const file = path.join(work, 'cube.3mf')
fs.writeFileSync(file, zip)

try {
  const out = await ElegooSlicerService.slice({
    modelPath: file, outputDirectory: work, nozzleSize: 0.4,
    filamentMaterial: 'PLA', filamentName: 'PLA (Generic)', filamentId: 'pla-generic',
  })
  const gcode = fs.readFileSync(out, 'utf8')
  assert.match(gcode, /printer_model = Elegoo Centauri Carbon/, 'must slice with the Centauri Carbon machine profile')
  assert.match(gcode, /PLA/i, 'must carry the selected filament')
  const layers = (gcode.match(/^;LAYER_CHANGE/gm) || []).length
  assert.equal(layers, 100, `a 20mm cube at 0.2mm is 100 layers, got ${layers}`)
  console.log(`PASS: mesh-only .3mf sliced for the Centauri Carbon (${layers} layers, ${gcode.length} bytes)`)
} finally {
  fs.rmSync(work, { recursive: true, force: true })
}
