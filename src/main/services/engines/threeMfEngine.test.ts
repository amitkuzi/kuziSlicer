/**
 * Self-check: node -r ts-node/register threeMfEngine.test.ts, or bundle+run via esbuild.
 */
import * as assert from 'assert'
import { zipSync, strToU8 } from 'fflate'
import ThreeMfEngine from './threeMfEngine'

const MODEL_XML = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter"><resources><object id="1" type="model"><mesh>
<vertices>
<vertex x="0" y="0" z="0" />
<vertex x="10" y="0" z="0" />
<vertex x="10" y="20.5" z="0" />
<vertex x="0" y="0" z="5.25" />
</vertices>
<triangles><triangle v1="0" v2="1" v3="2" /></triangles>
</mesh></object></resources></model>`

const archive = Buffer.from(
  zipSync({ '3D/3dmodel.model': strToU8(MODEL_XML), '[Content_Types].xml': strToU8('<Types/>') })
)

const geometry = ThreeMfEngine.parse3mfBuffer(archive)
assert.strictEqual(geometry.vertices.length, 4)
assert.deepStrictEqual(geometry.bounds.min, [0, 0, 0])
assert.deepStrictEqual(geometry.bounds.max, [10, 20.5, 5.25])

assert.throws(
  () => ThreeMfEngine.parse3mfBuffer(Buffer.from(zipSync({ 'junk.txt': strToU8('nope') }))),
  /No 3D model XML/
)

console.log('threeMfEngine: OK')
