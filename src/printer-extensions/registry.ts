import { a1Mini } from './bambulab-a1-mini'
import legacy from './legacy-profiles/profiles.json'
import { RAPID_PRINTER_EXTENSION, type RapidPrinterExtension } from './core/types'

/** Explicit registration keeps untrusted downloaded scripts out of the Electron main process. */
export class PrinterExtensionRegistry {
  private readonly extensions = new Map<string, RapidPrinterExtension>()
  register(extension: RapidPrinterExtension): void {
    const m = extension.manifest
    if (m.type !== RAPID_PRINTER_EXTENSION || m.apiVersion !== 1 || !/^[a-z0-9-]+$/.test(m.name) || !/^\d+\.\d+\.\d+$/.test(m.version)) throw new Error('Invalid printer extension manifest')
    if (this.extensions.has(m.name)) throw new Error('Duplicate printer extension')
    if (!Array.isArray(m.firmware) || !m.firmware.length || !extension.profiles.length || typeof extension.prepare !== 'function' || typeof extension.connect !== 'function') throw new Error('Incomplete printer extension')
    const ids = new Set<string>()
    for (const p of extension.profiles) {
      if (ids.has(p.id)) throw new Error('Duplicate printer profile')
      ids.add(p.id)
      if (![p.nozzleSize, p.bedSizeX, p.bedSizeY, p.bedSizeZ, p.maxTemp, p.maxBedTemp].every(x => Number.isFinite(x) && x > 0)) throw new Error('Invalid printer profile')
      if ([...this.extensions.values()].some(e => e.profiles.some(other => other.id === p.id))) throw new Error('Duplicate printer profile')
    }
    this.extensions.set(m.name, extension)
  }
  get(name: string): RapidPrinterExtension {
    const extension = this.extensions.get(name)
    if (!extension) throw new Error(`Unknown printer extension: ${name}`)
    return extension
  }
  list() { return [...this.extensions.values()].map(e => ({ ...e.manifest, profiles: e.profiles })) }
  profiles() { return [...legacy.printers.filter(p => !p.id.startsWith('bambulab-a1-mini')), ...[...this.extensions.values()].flatMap(e => [...e.profiles])] }
}
export const printerExtensions = new PrinterExtensionRegistry()
printerExtensions.register(a1Mini)
