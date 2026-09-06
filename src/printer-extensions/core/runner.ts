import { randomUUID } from 'crypto'
import type { PrinterConnection, PrinterStatus, PrinterTransport, RapidPrinterExtension } from './types'

const active = new Set<string>()
/** A deadline both rejects the operation and aborts its owned transport resources. */
export async function bounded<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs = 20000): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid deadline')
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([operation(controller.signal), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('Operation timed out; outcome may be unknown. Do not retry a print automatically.')) }, timeoutMs)
    })])
  } finally { clearTimeout(timer); controller.abort() }
}

export function assertReady(status: PrinterStatus, model: string, nozzle: number): void {
  if (status.model !== model) throw new Error('Printer model is unknown or differs from the package')
  if (status.nozzle !== nozzle) throw new Error('Installed nozzle differs from the selected package nozzle')
  if (!['IDLE', 'FINISH'].includes(status.state)) throw new Error(`Printer is not idle: ${status.state}`)
  if (status.error !== 0) throw new Error('Printer reports an error or unknown error status')
}

/** Never equates a publish callback with acceptance; start waits for a correlated device report. */
export async function runPrint(extension: RapidPrinterExtension, connection: PrinterConnection,
  bytes: Uint8Array, nozzle: number, timeoutMs = 20000): Promise<{ success: true; message: string; job: string; sha256: string }> {
  if (!extension.manifest.firmware.includes(connection.firmware)) throw new Error('Unsupported printer / firmware combination')
  const prepared = extension.prepare(bytes, nozzle)
  const key = connection.ip
  if (active.has(key)) throw new Error('A print dispatch is already in progress for this printer')
  active.add(key)
  let transport: PrinterTransport | undefined
  try {
    transport = extension.connect(connection)
    const client = transport
    assertReady(await bounded(s => client.status(s), timeoutMs), prepared.model, nozzle)
    const name = `kuzi_${randomUUID()}.gcode.3mf`
    await bounded(s => client.upload(prepared.bytes, name, s), timeoutMs)
    assertReady(await bounded(s => client.status(s), timeoutMs), prepared.model, nozzle)
    await bounded(s => client.start(prepared, name, s), timeoutMs)
    return { success: true, message: 'Printer confirmed this job is preparing or running; completion is not yet verified.', job: name, sha256: prepared.sha256 }
  } finally { try { transport?.close() } finally { active.delete(key) } }
}
