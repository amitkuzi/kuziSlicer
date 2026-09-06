/**
 * Slice Engine — mesh → per-layer closed contours.
 * Pure math, no I/O. Triangle/plane intersection + segment chaining.
 */

import type { StlGeometry } from './stlEngine'

export interface Point2 {
  x: number
  y: number
}

/** A closed loop of points (first point is NOT repeated at the end). */
export type Contour = Point2[]

export interface Layer {
  z: number
  contours: Contour[]
}

// Endpoints that came from the same mesh vertex can differ in the last bits of a
// float, so chaining keys are snapped to this grid (0.1 micron -- far below any
// printable feature, far above float noise).
const WELD = 1e4
const key = (p: Point2) => `${Math.round(p.x * WELD)},${Math.round(p.y * WELD)}`

export class SliceEngine {
  /**
   * Slice a mesh into layer contours.
   * `geometry.vertices` is a flat list where every 3 consecutive points form a triangle
   * (the shape both StlEngine and ThreeMfEngine produce).
   */
  static sliceMesh(geometry: StlGeometry, layerHeight: number): Layer[] {
    const { vertices, bounds } = geometry
    if (layerHeight <= 0) throw new Error('layerHeight must be positive')

    const minZ = bounds.min[2]
    const maxZ = bounds.max[2]
    const layerCount = Math.max(1, Math.ceil((maxZ - minZ) / layerHeight))

    // Bucket triangles by the layers they span, so each layer only tests the
    // triangles that actually cross it (a full scan per layer is O(layers x triangles)
    // and gets unusable past a few thousand triangles).
    const buckets: number[][] = Array.from({ length: layerCount }, () => [])
    const triangleCount = Math.floor(vertices.length / 3)

    for (let t = 0; t < triangleCount; t++) {
      const a = vertices[t * 3]
      const b = vertices[t * 3 + 1]
      const c = vertices[t * 3 + 2]
      const triMin = Math.min(a[2], b[2], c[2])
      const triMax = Math.max(a[2], b[2], c[2])
      const first = Math.max(0, Math.floor((triMin - minZ) / layerHeight))
      const last = Math.min(layerCount - 1, Math.ceil((triMax - minZ) / layerHeight))
      for (let i = first; i <= last; i++) buckets[i].push(t)
    }

    const layers: Layer[] = []
    for (let i = 0; i < layerCount; i++) {
      // Sample mid-layer: a plane through a vertex produces degenerate (zero-length or
      // duplicated) segments that break chaining, and mid-layer is also the height the
      // extrudate is actually centred on.
      const z = minZ + i * layerHeight + layerHeight / 2
      const segments: [Point2, Point2][] = []

      for (const t of buckets[i]) {
        const seg = this.intersectTriangle(
          vertices[t * 3],
          vertices[t * 3 + 1],
          vertices[t * 3 + 2],
          z
        )
        if (seg) segments.push(seg)
      }

      layers.push({ z, contours: this.chainSegments(segments) })
    }

    return layers
  }

  /** Intersect one triangle with a horizontal plane; returns the cut segment, if any. */
  private static intersectTriangle(
    a: number[],
    b: number[],
    c: number[],
    z: number
  ): [Point2, Point2] | null {
    const points: Point2[] = []
    const edges: [number[], number[]][] = [
      [a, b],
      [b, c],
      [c, a],
    ]

    for (const [p, q] of edges) {
      const dp = p[2] - z
      const dq = q[2] - z
      // Strict sign change only -- a vertex exactly on the plane is ignored here and
      // picked up by the neighbouring edge, which avoids duplicate points.
      if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) {
        const t = dp / (dp - dq)
        points.push({ x: p[0] + (q[0] - p[0]) * t, y: p[1] + (q[1] - p[1]) * t })
      }
    }

    if (points.length !== 2) return null
    if (key(points[0]) === key(points[1])) return null
    return [points[0], points[1]]
  }

  /** Walk cut segments into closed loops. Open chains are kept (mesh holes) if long enough. */
  private static chainSegments(segments: [Point2, Point2][]): Contour[] {
    const adjacency = new Map<string, number[]>()
    segments.forEach(([p, q], index) => {
      for (const point of [p, q]) {
        const k = key(point)
        const list = adjacency.get(k)
        if (list) list.push(index)
        else adjacency.set(k, [index])
      }
    })

    const used = new Array(segments.length).fill(false)
    const contours: Contour[] = []

    for (let start = 0; start < segments.length; start++) {
      if (used[start]) continue
      used[start] = true

      const contour: Contour = [segments[start][0], segments[start][1]]
      let endKey = key(segments[start][1])

      // Follow whichever unused segment shares the current end point.
      for (;;) {
        const candidates = adjacency.get(endKey)
        if (!candidates) break
        const next = candidates.find((i) => !used[i])
        if (next === undefined) break

        used[next] = true
        const [p, q] = segments[next]
        const nextPoint = key(p) === endKey ? q : p
        endKey = key(nextPoint)
        if (endKey === key(contour[0])) break // closed
        contour.push(nextPoint)
      }

      // Two points can't enclose area; drop those slivers rather than emitting
      // zero-width "loops" the G-code stage would turn into stuttering moves.
      if (contour.length >= 3) {
        const simplified = this.dropCollinear(contour)
        if (simplified.length >= 3) contours.push(simplified)
      }
    }

    return contours
  }

  /**
   * Remove points that sit on the straight line between their neighbours.
   * Every flat face is triangulated, so a plain box wall arrives as several collinear
   * points -- keeping them would emit one G1 per triangle edge instead of one per wall.
   */
  private static dropCollinear(contour: Contour, tolerance = 1e-6): Contour {
    const result: Contour = []
    for (let i = 0; i < contour.length; i++) {
      const prev = contour[(i - 1 + contour.length) % contour.length]
      const curr = contour[i]
      const next = contour[(i + 1) % contour.length]
      const cross =
        (curr.x - prev.x) * (next.y - prev.y) - (curr.y - prev.y) * (next.x - prev.x)
      if (Math.abs(cross) > tolerance) result.push(curr)
    }
    return result.length >= 3 ? result : contour
  }

  /** Even-odd point-in-polygon test (handles holes when all contours are passed in). */
  static isInside(contours: Contour[], point: Point2): boolean {
    let inside = false
    for (const contour of contours) {
      for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
        const a = contour[i]
        const b = contour[j]
        if (a.y > point.y !== b.y > point.y) {
          const x = a.x + ((point.y - a.y) / (b.y - a.y)) * (b.x - a.x)
          if (point.x < x) inside = !inside
        }
      }
    }
    return inside
  }

  /**
   * Inset a closed contour by `distance` along each vertex's angle bisector.
   * ponytail: no self-intersection cleanup -- thin features can fold on themselves at
   * large insets. Upgrade to a real polygon offset (Clipper-style) when multi-perimeter
   * quality on thin walls matters.
   */
  static offsetContour(contour: Contour, distance: number): Contour {
    if (contour.length < 3) return []
    const area = this.signedArea(contour)
    if (area === 0) return []
    // Inward is left of travel for CCW loops, right for CW ones.
    const sign = area > 0 ? 1 : -1
    const result: Contour = []

    for (let i = 0; i < contour.length; i++) {
      const prev = contour[(i - 1 + contour.length) % contour.length]
      const curr = contour[i]
      const next = contour[(i + 1) % contour.length]

      const n1 = this.edgeNormal(prev, curr, sign)
      const n2 = this.edgeNormal(curr, next, sign)
      if (!n1 || !n2) continue

      // Average the two edge normals, then lengthen to keep the offset distance
      // correct at the corner (1/cos of the half-angle).
      let bx = n1.x + n2.x
      let by = n1.y + n2.y
      const len = Math.hypot(bx, by)
      if (len < 1e-9) continue
      bx /= len
      by /= len
      const cos = bx * n1.x + by * n1.y
      const scale = distance / Math.max(cos, 0.35) // cap spikes at sharp corners

      result.push({ x: curr.x + bx * scale, y: curr.y + by * scale })
    }

    return result.length >= 3 ? result : []
  }

  private static edgeNormal(a: Point2, b: Point2, sign: number): Point2 | null {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy)
    if (len < 1e-9) return null
    return { x: (dy / len) * sign, y: (-dx / len) * sign }
  }

  static signedArea(contour: Contour): number {
    let area = 0
    for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
      area += (contour[j].x + contour[i].x) * (contour[j].y - contour[i].y)
    }
    return area / 2
  }
}

export default SliceEngine
