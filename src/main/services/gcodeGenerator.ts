/**
 * G-code Generation — Main service orchestrator.
 * Handles file I/O, calls Engine for pure math, coordinates with PluginHost.
 */

import * as path from 'path'
import * as fs from 'fs'
import { Worker } from 'worker_threads'
import { app } from 'electron'
import PluginHostClient from '../clients/pluginHostClient'
import ProfilesManager, { ProfilesData } from './profilesManager'
import ElegooSlicerService from './elegooSlicerService'
import { parseModelGeometry, LocalSliceOptions } from './localSlicer'
import GcodeEngine from './engines/gcodeEngine'

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
  /** Infill pattern id, from the infill library (grid, lines, triangles, gyroid, concentric). */
  infillPattern?: string
  shellThickness: number
  supportEnabled: boolean
  fanSpeed: number
}

/** Move/rotate/scale applied in the 3D viewport, in the viewport's own units. */
export interface ModelTransform {
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
}

export interface GcodeGeneratorOptions {
  modelPath: string
  printerProfile: PrinterProfile
  filamentProfile: FilamentProfile
  settings: PrintSettings
  transform?: ModelTransform
}

/** Coarse phases a caller can surface while a slice runs. */
export type SliceProgress =
  | { phase: 'preparing' }
  | { phase: 'slicing'; done: number; total: number }
  | { phase: 'external' }
  | { phase: 'idle' }

/**
 * One slice at a time: a second request supersedes the first rather than piling up
 * worker threads, and a live worker would otherwise keep the app from quitting.
 */
let activeWorker: Worker | null = null

export function stopActiveSlice(): void {
  activeWorker?.terminate()
  activeWorker = null
}

/** The worker writes the G-code itself -- a large job's output never crosses the thread boundary. */
function sliceInWorker(
  options: LocalSliceOptions & { outputPath: string },
  onProgress?: (progress: SliceProgress) => void
): Promise<string> {
  stopActiveSlice()
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'sliceWorker.js'), { workerData: options })
    activeWorker = worker
    const settle = (fn: () => void) => {
      if (activeWorker === worker) activeWorker = null
      fn()
    }
    worker.on('message', (msg: { type: string; message?: string; done?: number; total?: number }) => {
      if (msg.type === 'progress') {
        onProgress?.({ phase: 'slicing', done: msg.done!, total: msg.total! })
      } else if (msg.type === 'done') {
        settle(() => resolve(options.outputPath))
      } else {
        settle(() => reject(new Error(msg.message || 'Slicing failed')))
      }
    })
    worker.on('error', (err) => settle(() => reject(err)))
    worker.on('exit', (code) => {
      if (code !== 0) settle(() => reject(new Error(`Slice worker exited with code ${code}`)))
    })
  })
}

export class GcodeGenerator {
  private static hostClient: PluginHostClient | null = null
  private static profiles: ProfilesData | null = null

  /**
   * Initialize generator (call once on app startup).
   */
  static async initialize(hostClient?: PluginHostClient): Promise<void> {
    this.hostClient = hostClient ?? null
    this.profiles = ProfilesManager.loadProfiles()
  }

  /**
   * Slice a model and return the path of the G-code file it produced. The result stays on
   * disk throughout -- a big plate's G-code is far too large to keep passing around as a string.
   * Future: call PluginHost for Phase 1 slicing (Arachne engine).
   */
  static async generateToFile(
    options: GcodeGeneratorOptions,
    onProgress?: (progress: SliceProgress) => void
  ): Promise<string> {
    onProgress?.({ phase: 'preparing' })
    if (ElegooSlicerService.supports(options.printerProfile.id)) {
      onProgress?.({ phase: 'external' })
      const outputDirectory = path.join(app.getPath('temp'), 'kuziSlicer', `slice-${Date.now()}`)
      const outputPath = await ElegooSlicerService.slice({
        modelPath: options.modelPath,
        outputDirectory,
        nozzleSize: options.printerProfile.nozzleSize,
        filamentMaterial: options.filamentProfile.material,
        filamentName: options.filamentProfile.name,
        filamentId: options.filamentProfile.id,
      })
      return outputPath
    }

    // For Phase 0: use local engine, off-thread. Phase 1 will call PluginHost.
    const tempDir = path.join(app.getPath('temp'), 'kuziSlicer')
    fs.mkdirSync(tempDir, { recursive: true })
    const outputPath = path.join(tempDir, `print_${Date.now()}.gcode`)
    return sliceInWorker({ ...options, outputPath }, onProgress)
  }

  /**
   * Estimate print time (calls Engine).
   */
  static estimatePrintTime(
    modelPath: string,
    filament: FilamentProfile,
    settings: PrintSettings
  ): number {
    try {
      const geometry = parseModelGeometry(modelPath)
      return GcodeEngine.estimatePrintTime(geometry, filament, settings)
    } catch {
      return 0
    }
  }

  /**
   * Estimate filament weight (calls Engine).
   */
  static estimateFilamentWeight(
    modelPath: string,
    filament: FilamentProfile,
    settings: PrintSettings
  ): number {
    try {
      const geometry = parseModelGeometry(modelPath)
      return GcodeEngine.estimateFilamentWeight(geometry, filament, settings)
    } catch {
      return 0
    }
  }

  /**
   * Get available printer profiles.
   */
  static getPrinterProfiles(): ReadonlyArray<PrinterProfile> {
    return this.profiles?.printers || []
  }

  /**
   * Get available filament profiles.
   */
  static getFilamentProfiles(): ReadonlyArray<FilamentProfile> {
    return this.profiles?.filaments || []
  }

  /**
   * Reload profiles from disk.
   */
  static reloadProfiles(): void {
    this.profiles = ProfilesManager.loadProfiles()
  }
}
