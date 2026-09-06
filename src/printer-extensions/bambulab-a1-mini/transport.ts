import mqtt from 'mqtt'
import { Client } from 'basic-ftp'
import { Readable } from 'stream'
import { randomInt } from 'crypto'
import { isIP } from 'net'
import type { PrinterConnection, PrinterStatus, PrinterTransport, PreparedPrint } from '../core/types'

type Report = { print?: Record<string, any>; info?: { module?: Array<Record<string, string>> } }

/** One bounded MQTT session per operation. No background reconnects or start retries. */
export class BambuTransport implements PrinterTransport {
  private cleanup = new Set<() => void>()
  constructor(private readonly connection: PrinterConnection) {
    if (!isIP(connection.ip) || !/^[A-Za-z0-9]{8}$/.test(connection.accessCode) || !/^[A-Za-z0-9_-]{5,40}$/.test(connection.serialNumber)) throw new Error('Valid printer IP, LAN access code and serial number are required')
    if (connection.firmware !== 'stock') throw new Error('A1 mini supports stock Bambu LAN firmware, not OpenCentauri')
  }
  private exchange<T>(commands: Record<string, unknown>[], accept: (report: Report) => T | undefined, signal: AbortSignal): Promise<T> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new Error('Operation aborted'))
      const client = mqtt.connect({ host: this.connection.ip, port: 8883, protocol: 'mqtts', username: 'bblp',
        password: this.connection.accessCode, rejectUnauthorized: false, reconnectPeriod: 0, connectTimeout: 10000 })
      let done = false
      const finish = (error?: Error, value?: T) => {
        if (done) return
        done = true
        clearTimeout(timer)
        signal.removeEventListener('abort', abort)
        this.cleanup.delete(abort)
        client.end(true)
        error ? reject(error) : resolve(value as T)
      }
      const abort = () => finish(new Error('Operation aborted; dispatch outcome may be unknown'))
      const timer = setTimeout(() => finish(new Error('Printer response timeout; do not automatically retry a start')), 20000)
      this.cleanup.add(abort)
      signal.addEventListener('abort', abort, { once: true })
      const reportTopic = `device/${this.connection.serialNumber}/report`
      client.on('error', () => finish(new Error('Printer MQTT connection failed; check LAN mode and credentials')))
      client.on('close', () => { if (!done) finish(new Error('Printer connection closed before confirmation')) })
      client.on('message', (topic, bytes, packet) => {
        if (packet.retain || topic !== reportTopic || bytes.length > 1024 * 1024) return
        let report: Report
        try { report = JSON.parse(bytes.toString()) } catch { return }
        try { const value = accept(report); if (value !== undefined) finish(undefined, value) } catch (error) { finish(error instanceof Error ? error : new Error(String(error))) }
      })
      client.on('connect', () => client.subscribe(reportTopic, { qos: 0 }, error => {
        if (error) return finish(new Error('Printer report subscription failed'))
        for (const command of commands) client.publish(`device/${this.connection.serialNumber}/request`, JSON.stringify(command), { qos: 0 }, error => {
          if (error) finish(new Error('Printer command publish failed'))
        })
      }))
    })
  }
  async status(signal: AbortSignal): Promise<PrinterStatus> {
    let snapshot: Record<string, any> = {}, modules: Array<Record<string, string>> = []
    return this.exchange([
      { info: { command: 'get_version', sequence_id: String(randomInt(1, 9999999)) } },
      { pushing: { command: 'pushall', sequence_id: String(randomInt(1, 9999999)) } },
    ], report => {
      if (report.info?.module) modules = report.info.module
      if (report.print) snapshot = { ...snapshot, ...report.print }
      if (!snapshot.gcode_state || !modules.length) return
      const ota = modules.find(item => item.name === 'ota')
      const model = modules.find(item => item.product_name === 'Bambu Lab A1 mini')?.product_name ?? 'unknown'
      return { model, firmware: ota?.sw_ver ?? 'unknown', state: snapshot.gcode_state,
        nozzle: Number(snapshot.nozzle_diameter), job: snapshot.subtask_name ?? '', progress: Number(snapshot.mc_percent ?? 0), error: Number(snapshot.print_error) }
    }, signal)
  }
  async upload(bytes: Uint8Array, name: string, signal: AbortSignal): Promise<void> {
    if (signal.aborted) throw new Error('Operation aborted')
    if (!/^kuzi_[\w-]+\.gcode\.3mf$/.test(name)) throw new Error('Unsafe remote filename')
    const client = new Client(15000)
    const close = () => client.close()
    this.cleanup.add(close)
    signal.addEventListener('abort', close, { once: true })
    const deadline = setTimeout(close, 60000)
    try {
      await client.access({ host: this.connection.ip, port: 990, user: 'bblp', password: this.connection.accessCode,
        secure: 'implicit', secureOptions: { rejectUnauthorized: false } })
      await client.uploadFrom(Readable.from(Buffer.from(bytes)), name)
      if (await client.size(name) !== bytes.length) throw new Error('Remote upload size mismatch')
    } finally { clearTimeout(deadline); signal.removeEventListener('abort', close); this.cleanup.delete(close); close() }
  }
  async start(job: PreparedPrint, name: string, signal: AbortSignal): Promise<void> {
    if (!/^kuzi_[\w-]+\.gcode\.3mf$/.test(name) || !/^Metadata\/plate_\d+\.gcode$/.test(job.plate)) throw new Error('Unsafe remote filename or plate')
    const sequence = String(randomInt(1, 9999999))
    let snapshot: Record<string, any> = {}
    await this.exchange([{ print: { sequence_id: sequence, command: 'project_file', param: job.plate,
      project_id: '0', profile_id: '0', task_id: '0', subtask_id: '0', subtask_name: name,
      file: name, url: `file:///sdcard/${name}`, md5: '', timelapse: false, bed_leveling: true,
      flow_cali: false, vibration_cali: false, layer_inspect: false, use_ams: false,
    } }], report => {
      const p = report.print
      if (!p) return
      if (p.command === 'project_file' && String(p.sequence_id) === sequence && /fail|error/i.test(String(p.result))) throw new Error('Printer rejected the project')
      snapshot = { ...snapshot, ...p }
      if (snapshot.subtask_name === name && ['PREPARE', 'RUNNING'].includes(snapshot.gcode_state)) {
        if (snapshot.print_error !== undefined && Number(snapshot.print_error) !== 0) throw new Error('Printer reports a job error')
        return true
      }
    }, signal)
  }
  async control(command: 'pause' | 'resume' | 'stop', signal: AbortSignal): Promise<void> {
    if (!['pause', 'resume', 'stop'].includes(command)) throw new Error('Unsupported control command')
    const sequence = String(randomInt(1, 9999999))
    await this.exchange([{ print: { sequence_id: sequence, command } }], report => {
      const p = report.print
      if (p?.command !== command || String(p.sequence_id) !== sequence) return
      if (String(p.result).toLowerCase() !== 'success') throw new Error('Printer rejected control command')
      return true
    }, signal)
  }
  close(): void { for (const cleanup of [...this.cleanup]) cleanup(); this.cleanup.clear() }
}
