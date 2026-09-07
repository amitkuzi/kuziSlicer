/**
 * The CPU-bound half of slicing: parse the mesh, apply the viewport transform, emit G-code.
 * Kept free of any `electron` import so it can run inside a worker_thread (see sliceWorker.ts).
 */

import StlEngine, { StlGeometry } from './engines/stlEngine'
import ThreeMfEngine from './engines/threeMfEngine'
import GcodeEngine from './engines/gcodeEngine'
import type { PrinterProfile, FilamentProfile, PrintSettings, ModelTransform } from '../../types/ipc'

export interface LocalSliceOptions {
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
export function applyTransform(geometry: StlGeometry, transform: ModelTransform): StlGeometry {
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

export function parseModelGeometry(modelPath: string): StlGeometry {
  return modelPath.toLowerCase().endsWith('.3mf')
    ? ThreeMfEngine.parse3mf(modelPath)
    : StlEngine.parseStl(modelPath)
}

export function sliceLocally(
  options: LocalSliceOptions,
  onProgress?: (done: number, total: number) => void
): string {
  let geometry
  try {
    geometry = parseModelGeometry(options.modelPath)
    if (options.transform) geometry = applyTransform(geometry, options.transform)
  } catch (err) {
    throw new Error(`Failed to parse model: ${err instanceof Error ? err.message : err}`)
  }

  return GcodeEngine.generate({
    geometry,
    printer: options.printerProfile,
    filament: options.filamentProfile,
    settings: options.settings,
    onProgress,
  })
}
