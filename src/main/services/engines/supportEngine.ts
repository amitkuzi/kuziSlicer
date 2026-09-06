/**
 * Support Engine — finds overhangs and builds support pillars under them.
 * Pure math, no I/O.
 *
 * Works on a column grid rather than polygon booleans: sample the plate on a grid, ask
 * which layers each column is solid in, and any column that starts in mid-air needs
 * support beneath it. That avoids needing polygon difference operations, and the same
 * grid doubles as the support toolpath.
 */

import SliceEngine, { Layer, Point2 } from './sliceEngine'
import type { Segment } from './infill'

export interface SupportOptions {
  layerHeight: number
  /** Centre-to-centre distance between support lines, in mm. */
  spacing: number
  /**
   * Steepest overhang (degrees from vertical) that still prints unsupported.
   * 45° is the usual safe default: at that angle each layer is offset by its own
   * height, so it still has material underneath to bond to.
   */
  maxOverhangAngle: number
  /** Layers of air left between the top of a support and the model, so it snaps off. */
  gapLayers: number
}

export const DEFAULT_SUPPORT_OPTIONS: Omit<SupportOptions, 'layerHeight'> = {
  spacing: 2.5,
  maxOverhangAngle: 45,
  gapLayers: 1,
}

/**
 * Returns one array of printable segments per input layer (empty where no support
 * is needed).
 */
export function generateSupports(layers: Layer[], options: SupportOptions): Segment[][] {
  const empty = layers.map<Segment[]>(() => [])
  if (layers.length < 2 || options.spacing <= 0) return empty

  // Grid covers only the model's footprint, not the whole bed.
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const layer of layers) {
    for (const contour of layer.contours) {
      for (const p of contour) {
        if (p.x < minX) minX = p.x
        if (p.x > maxX) maxX = p.x
        if (p.y < minY) minY = p.y
        if (p.y > maxY) maxY = p.y
      }
    }
  }
  if (!Number.isFinite(minX)) return empty

  const columns = Math.max(1, Math.ceil((maxX - minX) / options.spacing) + 1)
  const rows = Math.max(1, Math.ceil((maxY - minY) / options.spacing) + 1)
  const pointAt = (col: number, row: number): Point2 => ({
    x: minX + col * options.spacing,
    y: minY + row * options.spacing,
  })

  // occupancy[layer][row * columns + col] -- is the model solid in this column?
  const occupancy = layers.map((layer) => {
    const grid = new Uint8Array(columns * rows)
    if (layer.contours.length === 0) return grid
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        if (SliceEngine.isInside(layer.contours, pointAt(col, row))) grid[row * columns + col] = 1
      }
    }
    return grid
  })

  // How far a layer may overhang the one below and still bond to it.
  const reach =
    options.layerHeight / Math.tan(((90 - options.maxOverhangAngle) * Math.PI) / 180 || 1e-6)

  const supportedFromBelow = (layerIndex: number, point: Point2): boolean => {
    const below = layers[layerIndex - 1]
    if (!below || below.contours.length === 0) return false
    // The column itself, plus four probes at the maximum safe overhang: a slope shallow
    // enough to self-support has material within `reach` on the layer below.
    if (SliceEngine.isInside(below.contours, point)) return true
    return [
      { x: point.x + reach, y: point.y },
      { x: point.x - reach, y: point.y },
      { x: point.x, y: point.y + reach },
      { x: point.x, y: point.y - reach },
    ].some((probe) => SliceEngine.isInside(below.contours, probe))
  }

  // needsSupport[layer][cell] -- where support material should be extruded.
  const needsSupport = layers.map(() => new Uint8Array(columns * rows))

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const cell = row * columns + col
      let lastOccupied = -1

      for (let i = 0; i < layers.length; i++) {
        if (!occupancy[i][cell]) continue

        // A column that becomes solid without anything under it is an overhang;
        // fill the gap below it, from the plate or the last solid layer.
        if (i > 0 && !occupancy[i - 1][cell] && !supportedFromBelow(i, pointAt(col, row))) {
          const from = lastOccupied + 1
          const to = i - 1 - options.gapLayers
          for (let fill = from; fill <= to; fill++) needsSupport[fill][cell] = 1
        }
        lastOccupied = i
      }
    }
  }

  // Turn supported cells into printable lines: join neighbours along each row so the
  // extruder draws continuous walls instead of disconnected dots.
  return needsSupport.map((grid) => {
    const segments: Segment[] = []
    for (let row = 0; row < rows; row++) {
      let runStart = -1
      for (let col = 0; col <= columns; col++) {
        const filled = col < columns && grid[row * columns + col] === 1
        if (filled && runStart === -1) runStart = col
        if (!filled && runStart !== -1) {
          const from = pointAt(runStart, row)
          const to = pointAt(col - 1, row)
          // A single isolated cell still needs a printable stub, not a zero-length move.
          segments.push([from, runStart === col - 1 ? { x: to.x + options.spacing / 2, y: to.y } : to])
          runStart = -1
        }
      }
    }
    return segments
  })
}

export default generateSupports
