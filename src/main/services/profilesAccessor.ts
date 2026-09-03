/**
 * Profiles Accessor — raw file I/O and network fetching.
 * No business logic; only read/write to userData, fetch from URLs.
 */

import * as fs from 'fs'
import https from 'https'

export interface RawProfileData {
  printers?: unknown[]
  filaments?: unknown[]
  exportedAt?: string
  version?: string
}

export class ProfilesAccessor {
  /**
   * Parse YAML string to object.
   * Basic impl; no external YAML library used (keep deps minimal per ponytail).
   */
  static yamlToObject(yaml: string): Record<string, unknown> {
    const obj: Record<string, unknown> = {}
    const lines = yaml.split('\n').filter((l) => l.trim())
    let currentArray: unknown[] | null = null
    let currentKey: string | null = null

    for (const line of lines) {
      const trimmed = line.trim()

      if (trimmed.startsWith('-')) {
        if (!currentArray) {
          currentArray = []
          if (currentKey) {
            obj[currentKey] = currentArray
          }
        }
        const value = trimmed.slice(1).trim()
        currentArray.push(this.parseYamlValue(value))
        continue
      }

      if (trimmed.includes(':')) {
        currentArray = null
        const [key, ...valueParts] = trimmed.split(':')
        const value = valueParts.join(':').trim()

        if (value) {
          obj[key] = this.parseYamlValue(value)
        } else {
          obj[key] = {}
        }
        currentKey = key
      }
    }

    return obj
  }

  /**
   * Serialize object to YAML string.
   */
  static objectToYaml(obj: unknown, indent = 0): string {
    const spaces = ' '.repeat(indent)

    if (Array.isArray(obj)) {
      return obj
        .map((item) => {
          const key = indent === 0 ? `- ` : `${spaces}- `
          if (typeof item === 'object' && item !== null) {
            return `${key}\n${this.objectToYaml(item, indent + 2)}`
          }
          return `${key}${item}`
        })
        .join('\n')
    }

    if (typeof obj === 'object' && obj !== null) {
      return Object.entries(obj)
        .map(([key, value]) => {
          if (value === null || value === undefined) return `${spaces}${key}:`
          if (typeof value === 'object') {
            return `${spaces}${key}:\n${this.objectToYaml(value, indent + 2)}`
          }
          if (typeof value === 'string') {
            return `${spaces}${key}: "${value}"`
          }
          return `${spaces}${key}: ${value}`
        })
        .join('\n')
    }

    return String(obj)
  }

  /**
   * Read YAML file from filesystem.
   */
  static readYaml(filePath: string): RawProfileData {
    const yaml = fs.readFileSync(filePath, 'utf-8')
    return this.yamlToObject(yaml) as RawProfileData
  }

  /**
   * Write YAML file to filesystem.
   */
  static writeYaml(filePath: string, data: RawProfileData): void {
    let yaml = '# kuziSlicer Profiles Export\n'
    yaml += `# Exported: ${data.exportedAt || new Date().toISOString()}\n`
    yaml += `# Version: ${data.version || '1.0'}\n\n`

    if (data.printers) {
      yaml += 'printers:\n' + this.objectToYaml(data.printers, 2) + '\n\n'
    }
    if (data.filaments) {
      yaml += 'filaments:\n' + this.objectToYaml(data.filaments, 2)
    }

    fs.writeFileSync(filePath, yaml, 'utf-8')
  }

  /**
   * Read JSON file from filesystem.
   */
  static readJson(filePath: string): RawProfileData {
    const json = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(json) as RawProfileData
  }

  /**
   * Write JSON file to filesystem.
   */
  static writeJson(filePath: string, data: RawProfileData): void {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
  }

  /**
   * Fetch content from HTTPS URL.
   */
  static async fetchUrl(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      https
        .get(url, (res) => {
          let data = ''
          res.on('data', (chunk) => {
            data += chunk
          })
          res.on('end', () => resolve(data))
        })
        .on('error', reject)
    })
  }

  /**
   * File exists check.
   */
  static fileExists(filePath: string): boolean {
    return fs.existsSync(filePath)
  }
}

export default ProfilesAccessor
