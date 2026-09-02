// IPC channel types for type-safe electron communication

export interface Printer {
  id: string
  name: string
  port: string
  isConnected: boolean
}

export interface PrinterProfile {
  id: string
  name: string
  nozzleSize: number
  bedSizeX: number
  bedSizeY: number
  bedSizeZ: number
  maxTemp: number
  maxBedTemp: number
  maxSpeed: number
  defaultSpeed: number
  acceleration: number
}

export interface FilamentProfile {
  id: string
  name: string
  material: string
  extruderTemp: number
  bedTemp: number
  printSpeed: number
  retractDistance: number
  retractSpeed: number
}

export interface PrintSettings {
  layerHeight: number
  infillDensity: number
  shellThickness: number
  supportEnabled: boolean
  fanSpeed: number
}

export interface ConfiguredPrinter {
  id: string
  name: string
  model: string
  ipAddress?: string
  port?: string
  lastConnected?: string
  status: 'online' | 'offline' | 'unknown'
}

export interface GcodeCommand {
  command: string
  params?: Record<string, unknown>
}

export interface AppSettings {
  theme?: 'light' | 'dark'
  defaultPrinter?: string
  [key: string]: unknown
}

// Async invoke channels
export type InvokeChannels = {
  'printer:list': () => Promise<Printer[]>
  'file:open': (options?: { defaultPath?: string }) => Promise<string | null>
  'gcode:send': (cmd: GcodeCommand) => Promise<boolean>
  'gcode:generate': (modelPath: string, printerName: string, filamentName: string, settings: PrintSettings) => Promise<string>
  'gcode:printers': () => Promise<PrinterProfile[]>
  'gcode:filaments': () => Promise<FilamentProfile[]>
  'gcode:estimate-time': (modelPath: string, filamentName: string, settings: PrintSettings) => Promise<number>
  'gcode:estimate-weight': (modelPath: string, filamentName: string, settings: PrintSettings) => Promise<number>
  'settings:get': (key: string) => Promise<unknown>
  'settings:set': (key: string, value: unknown) => Promise<void>
  'printer:configured:list': () => Promise<ConfiguredPrinter[]>
  'printer:configured:add': (printer: Omit<ConfiguredPrinter, 'id' | 'status' | 'lastConnected'>) => Promise<ConfiguredPrinter>
  'printer:configured:update': (id: string, printer: Partial<ConfiguredPrinter>) => Promise<ConfiguredPrinter>
  'printer:configured:delete': (id: string) => Promise<void>
  'printer:test-connection': (ipAddress: string, port?: string) => Promise<boolean>
}

// Send channels (fire and forget)
export type SendChannels = {
  'app:minimize': () => void
  'app:maximize': () => void
  'app:close': () => void
}

// Event channels (listener)
export type EventChannels = {
  'printer:connected': (printer: Printer) => void
  'printer:disconnected': (printerId: string) => void
  'app:update': (info: { version: string }) => void
}
