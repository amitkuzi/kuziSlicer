/**
 * STL Engine — pure parsing + geometry math.
 * No I/O, no Electron dependencies. Can run in worker/plugin.
 */

import * as fs from 'fs'

export interface StlGeometry {
  vertices: number[][]
  bounds: {
    min: number[]
    max: number[]
  }
}

export class StlEngine {
  /**
   * Parse ASCII or binary STL data.
   */
  static parseStl(filePath: string): StlGeometry {
    const fileBuffer = fs.readFileSync(filePath)
    if (this.isAsciiStl(fileBuffer)) {
      return this.parseAsciiStl(filePath)
    } else {
      return this.parseBinaryStl(fileBuffer)
    }
  }

  /**
   * Parse from buffer (for when you already have the file loaded).
   */
  static parseStlBuffer(buffer: Buffer): StlGeometry {
    if (this.isAsciiStl(buffer)) {
      const content = buffer.toString('utf-8')
      return this.parseAsciiContent(content)
    } else {
      return this.parseBinaryStl(buffer)
    }
  }

  private static isAsciiStl(buffer: Buffer): boolean {
    const header = buffer.toString('utf-8', 0, 5)
    return header === 'solid' || buffer.toString('utf-8', 0, 5).match(/\s/) !== null
  }

  private static parseAsciiStl(filePath: string): StlGeometry {
    const content = fs.readFileSync(filePath, 'utf-8')
    return this.parseAsciiContent(content)
  }

  private static parseAsciiContent(content: string): StlGeometry {
    const vertices: number[][] = []
    const vertexPattern =
      /vertex\s+([-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?)\s+([-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?)\s+([-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?)/g

    let match
    while ((match = vertexPattern.exec(content))) {
      vertices.push([parseFloat(match[1]), parseFloat(match[3]), parseFloat(match[5])])
    }

    return this.calculateBounds(vertices)
  }

  private static parseBinaryStl(buffer: Buffer): StlGeometry {
    const vertices: number[][] = []
    const numTriangles = buffer.readUInt32LE(80)

    let offset = 84
    for (let i = 0; i < numTriangles; i++) {
      // Skip normal vector (3 floats)
      offset += 12
      // Read 3 vertices (3 floats each)
      for (let j = 0; j < 3; j++) {
        const x = buffer.readFloatLE(offset)
        const y = buffer.readFloatLE(offset + 4)
        const z = buffer.readFloatLE(offset + 8)
        vertices.push([x, y, z])
        offset += 12
      }
      // Skip attribute byte count
      offset += 2
    }

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

    return {
      vertices,
      bounds: { min, max },
    }
  }
}

export default StlEngine
