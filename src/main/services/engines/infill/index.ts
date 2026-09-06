/**
 * Infill library — a registry of infill pattern contributions.
 *
 * Each pattern is a self-contained unit implementing `InfillPattern`; adding one means
 * appending to PATTERNS, nothing else in the slicer changes. This is the contribution
 * shape an `engine.infill` extension will register through once the extension registry
 * lands -- keeping the surface identical now means those become drop-in.
 */

import SliceEngine, { Contour, Point2 } from '../sliceEngine'

export type Segment = [Point2, Point2]

export interface InfillContext {
  /** Layer contours, already inset to where infill should start (outer loops + holes). */
  contours: Contour[]
  /** Centre-to-centre distance between infill lines, in mm. */
  spacing: number
  /** Layer number, so patterns can alternate direction between layers. */
  layerIndex: number
}

export interface InfillPattern {
  id: string
  name: string
  description: string
  generate(ctx: InfillContext): Segment[]
}

const boundsOf = (contours: Contour[]) => {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const contour of contours) {
    for (const p of contour) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.y < minY) minY = p.y
      if (p.y > maxY) maxY = p.y
    }
  }
  return { minX, minY, maxX, maxY }
}

const rotate = (p: Point2, cos: number, sin: number): Point2 => ({
  x: p.x * cos - p.y * sin,
  y: p.x * sin + p.y * cos,
})

/**
 * Parallel lines at `angleDeg`, clipped to the inside of the contours.
 * Works by rotating the layer flat, running a scanline fill, and rotating the
 * resulting spans back -- so one routine covers every straight-line pattern.
 */
export function scanlineFill(contours: Contour[], spacing: number, angleDeg: number): Segment[] {
  if (contours.length === 0 || spacing <= 0) return []

  const rad = (angleDeg * Math.PI) / 180
  const cos = Math.cos(-rad)
  const sin = Math.sin(-rad)
  const back = { cos: Math.cos(rad), sin: Math.sin(rad) }

  const rotated = contours.map((c) => c.map((p) => rotate(p, cos, sin)))
  const { minY, maxY } = boundsOf(rotated)
  const segments: Segment[] = []

  for (let y = minY + spacing / 2; y < maxY; y += spacing) {
    const crossings: number[] = []
    for (const contour of rotated) {
      for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
        const a = contour[i]
        const b = contour[j]
        // Half-open comparison: a vertex exactly on the scanline counts once, not twice.
        if (a.y > y !== b.y > y) {
          crossings.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x))
        }
      }
    }

    crossings.sort((p, q) => p - q)
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      if (crossings[i + 1] - crossings[i] < 1e-6) continue
      segments.push([
        rotate({ x: crossings[i], y }, back.cos, back.sin),
        rotate({ x: crossings[i + 1], y }, back.cos, back.sin),
      ])
    }
  }

  return segments
}

const lines: InfillPattern = {
  id: 'lines',
  name: 'Lines',
  description: 'Straight parallel lines, rotated 90° each layer. Fastest to print.',
  generate: ({ contours, spacing, layerIndex }) =>
    scanlineFill(contours, spacing, layerIndex % 2 === 0 ? 45 : 135),
}

const grid: InfillPattern = {
  id: 'grid',
  name: 'Grid',
  description: 'Two crossing line sets per layer. Strong, general purpose.',
  generate: ({ contours, spacing }) => [
    ...scanlineFill(contours, spacing * 2, 45),
    ...scanlineFill(contours, spacing * 2, 135),
  ],
}

const triangles: InfillPattern = {
  id: 'triangles',
  name: 'Triangles',
  description: 'Three line sets at 60°. Stiffest of the line patterns.',
  generate: ({ contours, spacing }) => [
    ...scanlineFill(contours, spacing * 3, 0),
    ...scanlineFill(contours, spacing * 3, 60),
    ...scanlineFill(contours, spacing * 3, 120),
  ],
}

const concentric: InfillPattern = {
  id: 'concentric',
  name: 'Concentric',
  description: 'Loops following the outline inward. Good for flexible or vase-like parts.',
  generate: ({ contours, spacing }) => {
    const segments: Segment[] = []
    let rings = contours
    // Bounded: a shape can only be inset so many times before it vanishes, but a
    // degenerate offset could otherwise spin forever.
    for (let depth = 0; depth < 200 && rings.length > 0; depth++) {
      const next: Contour[] = []
      for (const ring of rings) {
        const inset = SliceEngine.offsetContour(ring, spacing)
        if (inset.length < 3) continue
        for (let i = 0; i < inset.length; i++) {
          segments.push([inset[i], inset[(i + 1) % inset.length]])
        }
        next.push(inset)
      }
      rings = next
    }
    return segments
  },
}

const gyroid: InfillPattern = {
  id: 'gyroid',
  name: 'Gyroid',
  description: 'Wavy lines that alternate phase by layer. Even strength in all directions.',
  generate: ({ contours, spacing, layerIndex }) => {
    // ponytail: sinusoidal approximation of a gyroid cross-section (the real surface is
    // implicit and needs marching squares). Prints the same way and reads the same to a
    // user; swap in the true isosurface if simulation accuracy ever matters.
    const { minX, minY, maxX, maxY } = boundsOf(contours)
    const amplitude = spacing / 2
    const wavelength = spacing * 4
    const phase = ((layerIndex % 8) / 8) * Math.PI * 2
    const step = Math.max(0.4, spacing / 6)
    const segments: Segment[] = []

    for (let base = minY; base <= maxY + spacing; base += spacing) {
      let previous: Point2 | null = null
      for (let x = minX; x <= maxX; x += step) {
        const point = {
          x,
          y: base + amplitude * Math.sin((x / wavelength) * Math.PI * 2 + phase),
        }
        if (previous) {
          const mid = { x: (previous.x + point.x) / 2, y: (previous.y + point.y) / 2 }
          if (SliceEngine.isInside(contours, mid)) segments.push([previous, point])
        }
        previous = point
      }
    }

    return segments
  },
}

export const PATTERNS: InfillPattern[] = [grid, lines, triangles, gyroid, concentric]

export const getPattern = (id: string): InfillPattern =>
  PATTERNS.find((p) => p.id === id) || grid

/** Line spacing for a requested density, given the width one extruded line covers. */
export const spacingForDensity = (lineWidth: number, densityPercent: number): number =>
  densityPercent <= 0 ? 0 : lineWidth * (100 / Math.min(densityPercent, 100))

/** Solid fill used for top/bottom skins -- lines packed at one line width. */
export const solidFill = (contours: Contour[], lineWidth: number, layerIndex: number): Segment[] =>
  scanlineFill(contours, lineWidth, layerIndex % 2 === 0 ? 45 : 135)
