/**
 * 3MF Engine — pure parsing + geometry math.
 * A .3mf file is a zip archive containing 3D/3dmodel.model (XML with <vertex>/<triangle> tags).
 * ponytail: regex-extracts vertices instead of a full XML parser -- downstream (GcodeEngine)
 * only consumes geometry.bounds, so triangle winding/indices are never needed.
 */

import * as fs from 'fs'
import { unzipSync, strFromU8 } from 'fflate'
import type { StlGeometry } from './stlEngine'

export class ThreeMfEngine {
  static parse3mf(filePath: string): StlGeometry {
    return this.parse3mfBuffer(fs.readFileSync(filePath))
  }

  static parse3mfBuffer(buffer: Buffer): StlGeometry {
    const entries = unzipSync(new Uint8Array(buffer))
    const modelEntry = Object.keys(entries).find((name) => name.toLowerCase().endsWith('.model'))
    if (!modelEntry) throw new Error('No 3D model XML found inside .3mf archive')
    const xml = strFromU8(entries[modelEntry])

    const vertices: number[][] = []
    const vertexPattern = /<vertex\s+x="([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)"\s+y="([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)"\s+z="([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)"/g

    let match
    while ((match = vertexPattern.exec(xml))) {
      vertices.push([parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3])])
    }
    if (vertices.length === 0) throw new Error('3MF model contains no vertices')

    return this.calculateBounds(vertices)
  }

  private static calculateBounds(vertices: number[][]): StlGeometry {
    const min = [Infinity, Infinity, Infinity]
    const max = [-Infinity, -Infinity, -Infinity]

    for (const vertex of vertices) {
      for (let i = 0; i < 3; i++) {
        if (vertex[i] < min[i]) min[i] = vertex[i]
        if (vertex[i] > max[i]) max[i] = vertex[i]
      }
    }

    return { vertices, bounds: { min, max } }
  }
}

export default ThreeMfEngine
