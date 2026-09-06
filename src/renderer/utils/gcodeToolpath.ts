/**
 * G-code → renderable toolpath.
 *
 * Vertices are emitted in layer order so the preview's layer slider is just a
 * `setDrawRange` crop instead of a geometry rebuild.
 */

export const FEATURE_COLORS: Record<string, number> = {
  'WALL-OUTER': 0xff8a3d,
  'WALL-INNER': 0xffc65c,
  SKIN: 0xff5c7a,
  FILL: 0x8ad46a,
  SUPPORT: 0x9b8cff,
  OTHER: 0x6fd2ff,
}

export interface ToolpathLayer {
  z: number
  /** Vertex count (not float count) of extrusions up to and including this layer. */
  extrudeEnd: number
  travelEnd: number
}

export interface ToolpathData {
  extrudePositions: Float32Array
  extrudeColors: Float32Array
  travelPositions: Float32Array
  layers: ToolpathLayer[]
  bounds: { min: [number, number, number]; max: [number, number, number] } | null
}

const EMPTY: ToolpathData = {
  extrudePositions: new Float32Array(0),
  extrudeColors: new Float32Array(0),
  travelPositions: new Float32Array(0),
  layers: [],
  bounds: null,
}

const featureFromComment = (line: string): string => {
  const type = line.slice(6).trim().toUpperCase()
  return FEATURE_COLORS[type] !== undefined ? type : 'OTHER'
}

/** Read a parameter like `X12.34` out of a G-code line. */
const param = (line: string, letter: string): number | null => {
  const index = line.indexOf(letter)
  if (index === -1) return null
  const value = parseFloat(line.slice(index + 1))
  return Number.isFinite(value) ? value : null
}

export function parseGcodeToolpath(gcode: string): ToolpathData {
  if (!gcode || gcode.trim().length === 0) return EMPTY

  const extrude: number[] = []
  const colors: number[] = []
  const travel: number[] = []
  const layers: ToolpathLayer[] = []

  let x = 0
  let y = 0
  let z = 0
  let e = 0
  let relativeExtrusion = false
  let feature = 'OTHER'
  let currentLayerZ: number | null = null

  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]

  const closeLayer = (layerZ: number) => {
    layers.push({ z: layerZ, extrudeEnd: extrude.length / 3, travelEnd: travel.length / 3 })
  }

  for (const raw of gcode.split('\n')) {
    const line = raw.trim()
    if (line.length === 0) continue

    if (line.startsWith(';')) {
      if (line.toUpperCase().startsWith(';TYPE:')) feature = featureFromComment(line)
      continue
    }

    // Strip trailing comments so `G1 X1 ; note` still parses.
    const code = line.split(';')[0].trim()
    if (code.length === 0) continue

    if (code.startsWith('M83')) {
      relativeExtrusion = true
      continue
    }
    if (code.startsWith('M82')) {
      relativeExtrusion = false
      continue
    }
    if (code.startsWith('G92')) {
      const newE = param(code, 'E')
      if (newE !== null) e = newE
      continue
    }
    if (!code.startsWith('G0') && !code.startsWith('G1')) continue

    const nx = param(code, 'X') ?? x
    const ny = param(code, 'Y') ?? y
    const nz = param(code, 'Z') ?? z
    const rawE = param(code, 'E')

    // Positive filament delta means material is being laid down; a retraction
    // (negative delta) or a bare move is travel.
    let deltaE = 0
    if (rawE !== null) {
      deltaE = relativeExtrusion ? rawE : rawE - e
      e = relativeExtrusion ? e : rawE
    }

    const moved = nx !== x || ny !== y || nz !== z
    const isExtrusion = deltaE > 1e-9 && moved

    if (nz !== z || currentLayerZ === null) {
      // A Z change starts a new layer -- close the previous one first so the
      // slider's cumulative offsets stay monotonic.
      if (currentLayerZ !== null) closeLayer(currentLayerZ)
      currentLayerZ = nz
    }

    if (moved) {
      const target = isExtrusion ? extrude : travel
      target.push(x, y, z, nx, ny, nz)

      if (isExtrusion) {
        const color = FEATURE_COLORS[feature] ?? FEATURE_COLORS.OTHER
        const r = ((color >> 16) & 255) / 255
        const g = ((color >> 8) & 255) / 255
        const b = (color & 255) / 255
        colors.push(r, g, b, r, g, b)

        for (const [i, value] of [nx, ny, nz].entries()) {
          if (value < min[i]) min[i] = value
          if (value > max[i]) max[i] = value
        }
      }
    }

    x = nx
    y = ny
    z = nz
  }

  if (currentLayerZ !== null) closeLayer(currentLayerZ)

  // Keep only layers that actually laid material down. Start-up moves (homing, the
  // priming Z lift) otherwise become dead stops at the bottom of the layer slider.
  const meaningful = layers.filter(
    (layer, i) => layer.extrudeEnd > (i === 0 ? 0 : layers[i - 1].extrudeEnd)
  )

  return {
    extrudePositions: new Float32Array(extrude),
    extrudeColors: new Float32Array(colors),
    travelPositions: new Float32Array(travel),
    layers: meaningful.length > 0 ? meaningful : layers,
    bounds: min[0] === Infinity ? null : { min, max },
  }
}
