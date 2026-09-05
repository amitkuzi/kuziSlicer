import assert from 'node:assert/strict'
import path from 'node:path'
import esbuild from 'esbuild'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const built = esbuild.buildSync({ entryPoints: [path.resolve('src/main/clients/elegooPrinterClient.ts')], bundle: true, platform: 'node', format: 'cjs', write: false })
const mod = { exports: {} }
new Function('module', 'exports', 'require', built.outputFiles[0].text)(mod, mod.exports, require)
const { ElegooPrinterClient } = mod.exports

const packet = ElegooPrinterClient.buildStartPrintPacket('mainboard-1', 'cube.gcode', 'request-1', 123456)
assert.deepEqual(packet, {
  Id: 'mainboard-1',
  Data: {
    Cmd: 128,
    Data: {
      Filename: 'cube.gcode',
      StartLayer: 0,
      Calibration_switch: 1,
      PrintPlatformType: 0,
      Tlp_Switch: 0,
      slot_map: [],
      path_prefix: '/local',
    },
    RequestID: 'request-1',
    MainboardID: 'mainboard-1',
    TimeStamp: 123456,
    From: 1,
  },
  Topic: 'sdcp/request/mainboard-1',
})

console.log('PASS: Centauri Carbon start-print packet matches the verified SDCP schema')
