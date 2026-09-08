import type { PrinterProfile } from '../../main/services/gcodeGenerator'

export const RAPID_PRINTER_EXTENSION = 'rapid printer extension' as const
export const RAPID_PRINTER_EXTENSION_INTERFACE_VERSION = '1.0.0' as const
export interface PrinterConnection {
  readonly ip: string
  readonly accessCode: string
  readonly serialNumber: string
  readonly firmware: string
}
export interface PrinterStatus {
  readonly model: string
  readonly firmware: string
  readonly state: string
  readonly nozzle: number
  readonly job: string
  readonly progress: number
  readonly error: number
}
export interface PackOptions {
  readonly nozzleTemp: number
  readonly bedTemp: number
  readonly nozzle: number
  readonly objectName: string
}
export interface PreparedPrint {
  readonly bytes: Uint8Array
  readonly sha256: string
  readonly plate: string
  readonly nozzle: number
  readonly model: string
}
/** Transport implementations must close sockets on abort, never retry a start command. */
export interface PrinterTransport {
  status(signal: AbortSignal): Promise<PrinterStatus>
  upload(bytes: Uint8Array, name: string, signal: AbortSignal): Promise<void>
  start(job: PreparedPrint, name: string, signal: AbortSignal): Promise<void>
  control(command: 'pause' | 'resume' | 'stop', signal: AbortSignal): Promise<void>
  close(): void
}
export interface RapidPrinterExtension {
  readonly manifest: {
    readonly name: string
    readonly title: string
    readonly type: typeof RAPID_PRINTER_EXTENSION
    readonly version: string
    readonly apiVersion: 1
    readonly firmware: readonly string[]
  }
  readonly profiles: readonly PrinterProfile[]
  /**
   * Wrap kuziSlicer toolpaths in whatever project envelope this printer's firmware needs
   * (machine start/end sequence, metadata). Extensions that only accept projects exported
   * by the vendor's own slicer leave this out.
   */
  pack?(gcode: string, options: PackOptions): Uint8Array
  prepare(bytes: Uint8Array, nozzle: number): PreparedPrint
  connect(connection: PrinterConnection): PrinterTransport
}
