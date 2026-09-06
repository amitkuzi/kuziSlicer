/**
 * G-code Generation — Main service orchestrator.
 * Handles file I/O, calls Engine for pure math, coordinates with PluginHost.
 */

import * as path from 'path'
import * as fs from 'fs'
import { app } from 'electron'
import PluginHostClient from '../clients/pluginHostClient'
import StlEngine from './engines/stlEngine'
import GcodeEngine from './engines/gcodeEngine'
import ProfilesManager, { ProfilesData } from './profilesManager'
import ElegooSlicerService from './elegooSlicerService'

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

export interface GcodeGeneratorOptions {
  modelPath: string
  printerProfile: PrinterProfile
  filamentProfile: FilamentProfile
  settings: PrintSettings
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
   * Generate G-code from STL model.
   * Orchestrates: parse STL → call Engine → return result.
   * Future: call PluginHost for Phase 1 slicing (Arachne engine).
   */
  static async generate(options: GcodeGeneratorOptions): Promise<string> {
    if (ElegooSlicerService.supports(options.printerProfile.id)) {
      const outputDirectory = path.join(app.getPath('temp'), 'kuziSlicer', `slice-${Date.now()}`)
      const outputPath = await ElegooSlicerService.slice({
        modelPath: options.modelPath,
        outputDirectory,
        nozzleSize: options.printerProfile.nozzleSize,
        filamentMaterial: options.filamentProfile.material,
        filamentName: options.filamentProfile.name,
        filamentId: options.filamentProfile.id,
      })
      return fs.readFileSync(outputPath, 'utf-8')
    }

    // Parse STL
    let geometry
    try {
      geometry = StlEngine.parseStl(options.modelPath)
    } catch (err) {
      throw new Error(`Failed to parse STL: ${err instanceof Error ? err.message : err}`)
    }

    // For Phase 0: use local engine. Phase 1 will call PluginHost.
    return GcodeEngine.generate({
      geometry,
      printer: options.printerProfile,
      filament: options.filamentProfile,
      settings: options.settings,
    })
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
      const geometry = StlEngine.parseStl(modelPath)
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
      const geometry = StlEngine.parseStl(modelPath)
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
