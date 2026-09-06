// No network: validation paths and already-aborted signals only.
import assert from 'node:assert/strict'
import path from 'node:path'
import { createRequire } from 'node:module'
import esbuild from 'esbuild'
const require = createRequire(import.meta.url)
const built = esbuild.buildSync({ entryPoints: [path.resolve('src/printer-extensions/bambulab-a1-mini/transport.ts')],
  bundle: true, platform: 'node', format: 'cjs', external: ['mqtt', 'basic-ftp'], write: false })
const mod = { exports: {} }
new Function('module', 'exports', 'require', built.outputFiles[0].text)(mod, mod.exports, require)
const { BambuTransport } = mod.exports
const connection = { ip: '192.0.2.1', accessCode: '00000000', serialNumber: 'TEST0001', firmware: 'stock' }
let passed = 0
async function test(name, action) { await action(); passed++; console.log(`PASS: ${name}`) }
await test('Transport_InvalidConnection_RejectsBeforeNetwork', async () => {
  for (const override of [{ ip: 'invalid' }, { accessCode: '' }, { serialNumber: '' }, { firmware: 'opencentauri' }]) {
    assert.throws(() => new BambuTransport({ ...connection, ...override }))
  }
})
await test('Transport_AlreadyAborted_AllOperationsRejectWithoutNetwork', async () => {
  const transport = new BambuTransport(connection), controller = new AbortController()
  controller.abort()
  const job = { plate: 'Metadata/plate_3.gcode', model: 'Bambu Lab A1 mini', nozzle: 0.4, bytes: new Uint8Array(), sha256: '' }
  await assert.rejects(transport.status(controller.signal), /aborted/)
  await assert.rejects(transport.upload(job.bytes, 'kuzi_test.gcode.3mf', controller.signal), /aborted/)
  await assert.rejects(transport.start(job, 'kuzi_test.gcode.3mf', controller.signal), /aborted/)
  await assert.rejects(transport.control('pause', controller.signal), /aborted/)
  assert.doesNotThrow(() => { transport.close(); transport.close() })
})
await test('Transport_InvalidUploadName_RejectsWithoutNetwork', async () => {
  const transport = new BambuTransport(connection)
  await assert.rejects(transport.upload(new Uint8Array(), '../outside.gcode.3mf', new AbortController().signal), /Unsafe/)
})
await test('Transport_InvalidControl_RejectsWithoutNetwork', async () => {
  await assert.rejects(new BambuTransport(connection).control('factory-reset', new AbortController().signal), /Unsupported/)
})
console.log(`PASS: ${passed} independent transport validation cases`)
