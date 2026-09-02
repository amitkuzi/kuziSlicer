import * as fs from 'fs'
import * as path from 'path'
import https from 'https'
import { PrinterProfile, FilamentProfile } from './gcodeGenerator'

interface ProfileExport {
  printers: PrinterProfile[]
  filaments: FilamentProfile[]
  exportedAt: string
  version: string
}

export class ProfilesManager {
  static objectToYaml(obj: unknown, indent = 0): string {
    const spaces = ' '.repeat(indent)

    if (Array.isArray(obj)) {
      return obj.map((item, i) => {
        const key = indent === 0 ? `- ` : `${spaces}- `
        if (typeof item === 'object' && item !== null) {
          return `${key}\n${this.objectToYaml(item, indent + 2)}`
        }
        return `${key}${item}`
      }).join('\n')
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

  static yamlToObject(yaml: string): Record<string, unknown> {
    const obj: Record<string, unknown> = {}
    const lines = yaml.split('\n').filter(l => l.trim())
    let currentArray: unknown[] | null = null
    let currentKey: string | null = null
    const stack: { key: string; obj: Record<string, unknown> | unknown[] }[] = []

    for (const line of lines) {
      const indent = line.search(/\S/)
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

  private static parseYamlValue(value: string): unknown {
    value = value.trim()
    if (value.startsWith('"') && value.endsWith('"')) {
      return value.slice(1, -1)
    }
    if (value === 'true') return true
    if (value === 'false') return false
    if (!isNaN(Number(value))) return Number(value)
    return value
  }

  static exportToYaml(printers: PrinterProfile[], filaments: FilamentProfile[]): string {
    const data: ProfileExport = {
      printers,
      filaments,
      exportedAt: new Date().toISOString(),
      version: '1.0',
    }

    let yaml = '# kuziSlicer Profiles Export\n'
    yaml += `# Exported: ${data.exportedAt}\n`
    yaml += `# Version: ${data.version}\n\n`

    yaml += 'printers:\n'
    yaml += this.objectToYaml(printers, 2) + '\n\n'

    yaml += 'filaments:\n'
    yaml += this.objectToYaml(filaments, 2)

    return yaml
  }

  static saveProfilesYaml(filePath: string, printers: PrinterProfile[], filaments: FilamentProfile[]): void {
    const yaml = this.exportToYaml(printers, filaments)
    fs.writeFileSync(filePath, yaml, 'utf-8')
  }

  static loadProfilesYaml(filePath: string): { printers: PrinterProfile[]; filaments: FilamentProfile[] } {
    const yaml = fs.readFileSync(filePath, 'utf-8')
    const data = this.yamlToObject(yaml)

    return {
      printers: (data.printers as PrinterProfile[]) || [],
      filaments: (data.filaments as FilamentProfile[]) || [],
    }
  }

  static fetchFromUrl(url: string): Promise<string> {
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

  static async importFromGithub(
    owner: string,
    repo: string,
    branch = 'main',
    filePath = 'profiles.yaml'
  ): Promise<{ printers: PrinterProfile[]; filaments: FilamentProfile[] }> {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`
    const yaml = await this.fetchFromUrl(url)
    return this.parseYamlProfiles(yaml)
  }

  static async importFromUrl(url: string): Promise<{ printers: PrinterProfile[]; filaments: FilamentProfile[] }> {
    const yaml = await this.fetchFromUrl(url)
    return this.parseYamlProfiles(yaml)
  }

  static importFromFile(filePath: string): { printers: PrinterProfile[]; filaments: FilamentProfile[] } {
    return this.loadProfilesYaml(filePath)
  }

  static mergeProfiles(
    existing: { printers: PrinterProfile[]; filaments: FilamentProfile[] },
    imported: { printers: PrinterProfile[]; filaments: FilamentProfile[] },
    overwrite = false
  ): { printers: PrinterProfile[]; filaments: FilamentProfile[] } {
    let printers = [...existing.printers]
    let filaments = [...existing.filaments]

    if (overwrite) {
      printers = imported.printers
      filaments = imported.filaments
    } else {
      // Merge by ID, imported doesn't override existing
      const printerIds = new Set(printers.map((p) => p.id))
      const filamentIds = new Set(filaments.map((f) => f.id))

      imported.printers.forEach((p) => {
        if (!printerIds.has(p.id)) {
          printers.push(p)
        }
      })

      imported.filaments.forEach((f) => {
        if (!filamentIds.has(f.id)) {
          filaments.push(f)
        }
      })
    }

    return { printers, filaments }
  }

  private static parseYamlProfiles(yaml: string): { printers: PrinterProfile[]; filaments: FilamentProfile[] } {
    const data = this.yamlToObject(yaml)
    return {
      printers: (data.printers as PrinterProfile[]) || [],
      filaments: (data.filaments as FilamentProfile[]) || [],
    }
  }
}
