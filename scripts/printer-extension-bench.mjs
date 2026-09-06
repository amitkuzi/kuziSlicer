// Offline by default. Hardware modes require explicit flags and local environment credentials.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import esbuild from 'esbuild'

const require = createRequire(import.meta.url)
const args = process.argv.slice(2)
const option = (key, fallback) => { const i = args.indexOf(key); return i < 0 ? fallback : args[i + 1] }
const report = { at: new Date().toISOString(), offline: 'not-run', package: null, hardware: 'not-run', completion: 'not-verified' }
const output = path.resolve(option('--report', 'artifacts/printer-bench.json'))
function load(entry) {
  const build = esbuild.buildSync({ entryPoints: [path.resolve(entry)], bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false })
  const mod = { exports: {} }
  new Function('module', 'exports', 'require', build.outputFiles[0].text)(mod, mod.exports, require)
  return mod.exports
}
try {
  for (const script of ['test-rapidPrinterExtensions.mjs', 'test-rapidPrinterPrepare.mjs', 'test-rapidPrinterRegistry.mjs', 'test-rapidPrinterTransport.mjs']) {
    const result = spawnSync(process.execPath, [path.resolve('scripts', script)], { stdio: 'inherit', timeout: 60000 })
    if (result.status !== 0) throw new Error(`Offline test failed: ${script}`)
  }
  report.offline = 'passed'
  const extension = load(option('--extension', 'src/printer-extensions/bambulab-a1-mini/index.ts')).default
  const { PrinterExtensionRegistry } = load('src/printer-extensions/registry.ts')
  new PrinterExtensionRegistry().register(extension)
  const file = option('--file')
  const nozzle = Number(option('--nozzle', '0.4'))
  let bytes
  if (file) {
    if (fs.statSync(file).size > 64 * 1024 * 1024) throw new Error('Project exceeds bench size limit')
    bytes = fs.readFileSync(file)
    const prepared = extension.prepare(bytes, nozzle)
    report.package = { sha256: prepared.sha256, model: prepared.model, nozzle, plate: prepared.plate, bytes: bytes.length, validation: 'passed' }
  }
  if (args.includes('--status') || args.includes('--print')) {
    const connection = { ip: process.env.KUZI_PRINTER_IP ?? '', accessCode: process.env.KUZI_PRINTER_ACCESS_CODE ?? '', serialNumber: process.env.KUZI_PRINTER_SERIAL ?? '', firmware: option('--firmware', 'stock') }
    if (!connection.ip || !connection.accessCode || !connection.serialNumber) throw new Error('Set KUZI_PRINTER_IP, KUZI_PRINTER_ACCESS_CODE and KUZI_PRINTER_SERIAL locally for hardware mode')
    const { bounded, runPrint } = load('src/printer-extensions/core/runner.ts')
    let ownedJob
    if (args.includes('--print')) {
      if (!bytes) throw new Error('--print requires --file')
      const started = await runPrint(extension, connection, bytes, nozzle)
      ownedJob = started.job
      report.hardware = 'accepted'
      report.job = ownedJob
    }
    const client = extension.connect(connection)
    try {
      const end = Date.now() + Number(option('--monitor-minutes', '45')) * 60000
      if (!Number.isFinite(end) || end <= Date.now() || end > Date.now() + 4 * 3600000) throw new Error('Monitor duration must be positive and at most 240 minutes')
      do {
        const status = await bounded(s => client.status(s))
        report.status = status
        console.log(JSON.stringify(status))
        if (!ownedJob) { report.hardware = 'read-only-connected'; break }
        if (status.job !== ownedJob) throw new Error('Printer job changed or is unknown; no automatic retry or control issued')
        if (status.error !== 0 || status.state === 'FAILED') throw new Error('Printer reports failure; inspect the printer before further operation')
        if (status.state === 'FINISH') { report.completion = 'printer-reported-finish'; break }
        if (status.state === 'PAUSE') throw new Error('Printer paused; requires operator attention')
        if (Date.now() >= end) throw new Error('Monitoring deadline reached; completion remains unverified')
        await delay(5000)
      } while (true)
    } finally { client.close() }
  }
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error)
  process.exitCode = 1
} finally {
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
}
