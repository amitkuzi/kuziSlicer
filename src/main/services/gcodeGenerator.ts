/**
 * G-code Generation — Main service orchestrator.
 * Handles file I/O, calls Engine for pure math, coordinates with PluginHost.
 */

import * as path from 'path'
import * as fs from 'fs'
import { app } from 'electron'
import PluginHostClient from '../clients/pluginHostClient'
import StlEngine, { StlGeometry } from './engines/stlEngine'
import ThreeMfEngine from './engines/threeMfEngine'
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

/**
 * Apply the viewport transform to parsed geometry, so slicing prints what the user
 * arranged on screen. Rotation is XYZ-ordered to match Three.js's default Euler order.
 *
 * ponytail: rotation and scale only -- the G-code stage always centres the model on the
 * plate, so viewport position is intentionally dropped. Carry it through when
 * multi-object plates land and "where on the bed" starts to mean something.
 */
function applyTransform(geometry: StlGeometry, transform: ModelTransform): StlGeometry {
  const [rx, ry, rz] = transform.rotation
  const [sx, sy, sz] = transform.scale
  const cx = Math.cos(rx), sinx = Math.sin(rx)
  const cy = Math.cos(ry), siny = Math.sin(ry)
  const cz = Math.cos(rz), sinz = Math.sin(rz)

  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]

  const vertices = geometry.vertices.map(([x0, y0, z0]) => {
    let x = x0 * sx
    let y = y0 * sy
    let z = z0 * sz

    // Rz * Ry * Rx, the order Three.js applies for its default 'XYZ' Euler.
    let ny = y * cx - z * sinx
    let nz = y * sinx + z * cx
    y = ny
    z = nz

    let nx = x * cy + z * siny
    nz = -x * siny + z * cy
    x = nx
    z = nz

    nx = x * cz - y * sinz
    ny = x * sinz + y * cz
    x = nx
    y = ny

    const point = [x, y, z]
    for (let i = 0; i < 3; i++) {
      if (point[i] < min[i]) min[i] = point[i]
      if (point[i] > max[i]) max[i] = point[i]
    }
    return point
  })

  return { vertices, bounds: { min, max } }
}

function parseModelGeometry(modelPath: string): StlGeometry {
  return modelPath.toLowerCase().endsWith('.3mf')
    ? ThreeMfEngine.parse3mf(modelPath)
    : StlEngine.parseStl(modelPath)
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

    let geometry
    try {
      geometry = parseModelGeometry(options.modelPath)
      if (options.transform) geometry = applyTransform(geometry, options.transform)
    } catch (err) {
      throw new Error(`Failed to parse model: ${err instanceof Error ? err.message : err}`)
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
