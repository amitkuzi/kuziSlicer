// Test script for ProfilesManager - run with: npx ts-node test-profiles.ts

import * as fs from 'fs'
import * as path from 'path'

// Mock the ProfilesManager for testing
class ProfilesManager {
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

  static exportToYaml(printers: any[], filaments: any[]): string {
    const data = {
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
}

// Test data
const testPrinters = [
  {
    id: 'printer_001',
    name: 'Ender 3 Pro',
    nozzleSize: 0.4,
    bedSizeX: 235,
    bedSizeY: 235,
    bedSizeZ: 250,
    maxTemp: 300,
    maxBedTemp: 110,
    maxSpeed: 150,
    defaultSpeed: 80,
    acceleration: 1000,
  },
]

const testFilaments = [
  {
    id: 'filament_001',
    name: 'PLA - White',
    material: 'PLA',
    extruderTemp: 210,
    bedTemp: 60,
    printSpeed: 80,
    retractDistance: 0.8,
    retractSpeed: 25,
  },
]

// Run test
console.log('=== ProfilesManager Test ===\n')

const yaml = ProfilesManager.exportToYaml(testPrinters, testFilaments)
console.log('Generated YAML:\n')
console.log(yaml)

// Save to file
const testFile = path.join(__dirname, 'test-output.yaml')
fs.writeFileSync(testFile, yaml, 'utf-8')
console.log(`\n✓ Saved to: ${testFile}`)

// Verify file was created
if (fs.existsSync(testFile)) {
  console.log('✓ File created successfully')
  const content = fs.readFileSync(testFile, 'utf-8')
  console.log(`✓ File size: ${content.length} bytes`)
}
