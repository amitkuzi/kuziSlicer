// Independent counter-model tests: all transports are owned interface doubles; no hardware.
import assert from 'node:assert/strict'
import path from 'node:path'
import { createRequire } from 'node:module'
import esbuild from 'esbuild'

const require = createRequire(import.meta.url)
const built = esbuild.buildSync({ entryPoints: [path.resolve('src/printer-extensions/core/runner.ts')],
  bundle: true, platform: 'node', format: 'cjs', write: false })
const module = { exports: {} }
new Function('module', 'exports', 'require', built.outputFiles[0].text)(module, module.exports, require)
const { bounded, assertReady, runPrint } = module.exports
let passed = 0
async function test(name, run) { await run(); passed++; console.log(`PASS: ${name}`) }

const ready = { model: 'A1 mini', firmware: 'stock', state: 'IDLE', nozzle: 0.4, job: '', progress: 0, error: 0 }
const connection = { ip: 'test-device', accessCode: '', serialNumber: '', firmware: 'stock' }
const bytes = new Uint8Array([1, 2, 3])
function fixture(overrides = {}, extensionOverrides = {}) {
  const calls = []
  const transport = {
    status: async () => { calls.push('status'); return ready },
    upload: async () => { calls.push('upload') },
    start: async () => { calls.push('start') },
    control: async () => {}, close: () => { calls.push('close') }, ...overrides,
  }
  const extension = { manifest: { type: 'rapid printer extension', firmware: ['stock'] }, profiles: [],
    prepare: () => ({ bytes, sha256: 'digest', plate: 'Metadata/plate_3.gcode', nozzle: 0.4, model: 'A1 mini' }),
    connect: () => { calls.push('connect'); return transport }, ...extensionOverrides }
  return { calls, extension }
}

await test('Bounded_Success_ReturnsValueAndAbortsSignal', async () => {
  let signal
  assert.equal(await bounded(async s => { signal = s; return 42 }, 50), 42)
  assert.equal(signal.aborted, true)
})
await test('Bounded_HungOperation_RejectsAndAborts', async () => {
  let signal
  await assert.rejects(bounded(s => { signal = s; return new Promise(() => {}) }, 10), /timed out/)
  assert.equal(signal.aborted, true)
})
await test('Bounded_InvalidDeadlines_RejectWithoutExecuting', async () => {
  for (const deadline of [0, -1, NaN, Infinity]) {
    await assert.rejects(bounded(() => { throw new Error('must not execute') }, deadline), /Invalid deadline/)
  }
})
await test('Bounded_SynchronousFailure_AbortsSignalAndPropagates', async () => {
  let signal
  await assert.rejects(bounded(s => { signal = s; throw new Error('sync failure') }, 50), /sync failure/)
  assert.equal(signal.aborted, true)
})
await test('AssertReady_InvalidMachineState_Rejects', async () => {
  for (const status of [{ ...ready, model: 'Other' }, { ...ready, nozzle: 0.6 },
    { ...ready, state: 'RUNNING' }, { ...ready, state: 'UNKNOWN' }, { ...ready, error: 10 }, { ...ready, error: undefined }]) {
    assert.throws(() => assertReady(status, ready.model, ready.nozzle))
  }
  assert.doesNotThrow(() => assertReady({ ...ready, state: 'FINISH' }, ready.model, ready.nozzle))
})
await test('RunPrint_HappyPath_ValidatesBeforeAndAfterUpload', async () => {
  const { calls, extension } = fixture()
  const result = await runPrint(extension, connection, bytes, 0.4, 50)
  assert.deepEqual(calls, ['connect', 'status', 'upload', 'status', 'start', 'close'])
  assert.equal(result.success, true)
  assert.equal(result.sha256, 'digest')
  assert.match(result.message, /completion is not yet verified/)
})
await test('RunPrint_UnsupportedFirmware_DoesNotConnect', async () => {
  const { calls, extension } = fixture()
  await assert.rejects(runPrint(extension, { ...connection, firmware: 'opencentauri' }, bytes, 0.4), /Unsupported/)
  assert.deepEqual(calls, [])
})
await test('RunPrint_InvalidPackage_DoesNotConnect', async () => {
  const { calls, extension } = fixture({}, { prepare: () => { throw new Error('invalid package') } })
  await assert.rejects(runPrint(extension, connection, bytes, 0.4), /invalid package/)
  assert.deepEqual(calls, [])
})
await test('RunPrint_PrinterBusy_PreventsUploadAndCloses', async () => {
  const { calls, extension } = fixture({ status: async () => ({ ...ready, state: 'RUNNING' }) })
  await assert.rejects(runPrint(extension, connection, bytes, 0.4), /not idle/)
  assert.deepEqual(calls, ['connect', 'close'])
})
await test('RunPrint_UploadFailure_DoesNotStartAndCloses', async () => {
  const { calls, extension } = fixture({ upload: async () => { throw new Error('upload rejected') } })
  await assert.rejects(runPrint(extension, connection, bytes, 0.4), /upload rejected/)
  assert.deepEqual(calls, ['connect', 'status', 'close'])
})
await test('RunPrint_StatusNeverReturns_ClosesAndDoesNotUpload', async () => {
  let signal
  const { calls, extension } = fixture({ status: s => { signal = s; return new Promise(() => {}) } })
  await assert.rejects(runPrint(extension, connection, bytes, 0.4, 10), /timed out/)
  assert.deepEqual(calls, ['connect', 'close'])
  assert.equal(signal.aborted, true)
})
await test('RunPrint_UploadNeverReturns_HonorsDeadlineAndDoesNotStart', async () => {
  let signal
  const { calls, extension } = fixture({ upload: (_bytes, _name, s) => { signal = s; return new Promise(() => {}) } })
  await assert.rejects(runPrint(extension, connection, bytes, 0.4, 10), /timed out/)
  assert.deepEqual(calls, ['connect', 'status', 'close'])
  assert.equal(signal.aborted, true)
})
await test('RunPrint_ConnectThrows_ReleasesDispatchLock', async () => {
  const { extension } = fixture({}, { connect: () => { throw new Error('connect failed') } })
  await assert.rejects(runPrint(extension, connection, bytes, 0.4, 50), /connect failed/)
  await runPrint(fixture().extension, connection, bytes, 0.4, 50)
})
await test('RunPrint_BusyAfterUpload_DoesNotStart', async () => {
  let reads = 0
  const { calls, extension } = fixture({ status: async () => ++reads === 1 ? ready : { ...ready, state: 'RUNNING' } })
  await assert.rejects(runPrint(extension, connection, bytes, 0.4), /not idle/)
  assert.deepEqual(calls, ['connect', 'upload', 'close'])
})
await test('RunPrint_StartAcknowledgementLost_DoesNotRetry', async () => {
  let starts = 0
  const { calls, extension } = fixture({ start: async () => { starts++; return new Promise(() => {}) } })
  await assert.rejects(runPrint(extension, connection, bytes, 0.4, 10), /timed out/)
  assert.equal(starts, 1)
  assert.equal(calls.at(-1), 'close')
})
await test('RunPrint_ConcurrentDispatch_RejectsDuplicateAndReleasesLock', async () => {
  let release
  const { extension } = fixture({ status: () => new Promise(resolve => { release = () => resolve(ready) }) })
  const first = runPrint(extension, connection, bytes, 0.4, 15)
  await assert.rejects(runPrint(extension, connection, bytes, 0.4, 15), /already in progress/)
  release()
  await assert.rejects(first, /timed out/)
  await runPrint(fixture().extension, connection, bytes, 0.4, 50)
})
await test('RunPrint_CloseThrows_StillReleasesDispatchLock', async () => {
  const localConnection = { ...connection, ip: 'close-failure-device' }
  const { extension } = fixture({ close: () => { throw new Error('close failed') } })
  await assert.rejects(runPrint(extension, localConnection, bytes, 0.4, 50), /close failed/)
  await runPrint(fixture().extension, localConnection, bytes, 0.4, 50)
})
console.log(`PASS: ${passed} rapid printer extension counter-model cases`)
