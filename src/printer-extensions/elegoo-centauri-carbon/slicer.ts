import { execFile } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

export interface ElegooSliceOptions {
  modelPath: string
  outputDirectory: string
  nozzleSize: number
  filamentMaterial: string
  filamentName?: string
  filamentId?: string
}

export class ElegooSlicerService {
  private static readonly INSTALL_DIRECTORY = 'C:\\Program Files\\ElegooSlicer'
  private static readonly FILAMENT_PRESETS: Readonly<Record<string, string>> = {
    PLA: 'Elegoo PLA @ECC.json',
    PETG: 'Elegoo PETG @ECC.json',
    ABS: 'Elegoo ABS @ECC.json',
    ASA: 'Elegoo ASA @ECC.json',
    TPU: 'Elegoo TPU 95A @ECC.json',
    PC: 'Elegoo PC @ECC.json',
  }
  private static readonly GENERIC_FILAMENT_PRESETS: Readonly<Record<string, string>> = {
    PLA: 'Generic PLA @Elegoo Centauri.json',
    PETG: 'Generic PETG @Elegoo.json',
    ABS: 'Generic ABS @Elegoo Centauri.json',
    ASA: 'Generic ASA @Elegoo.json',
    PC: 'Generic PC @Elegoo.json',
    PA: 'Generic PA @Elegoo.json',
    NYLON: 'Generic PA @Elegoo.json',
    // ElegooSlicer does not ship a Generic TPU preset. Its ECC TPU 95A
    // preset is the closest official type-level profile and is used only
    // for generic TPU 95A selections.
    TPU: 'Elegoo TPU 95A @ECC.json',
  }

  static supports(printerId: string): boolean {
    return printerId === 'elegoo-centauri-carbon'
  }

  static async slice(options: ElegooSliceOptions): Promise<string> {
    const executable = path.join(this.INSTALL_DIRECTORY, 'elegoo-slicer.exe')
    if (!fs.existsSync(executable)) {
      throw new Error('ElegooSlicer is required. Install it from ELEGOO before slicing for the Centauri Carbon.')
    }
    if (!fs.existsSync(options.modelPath)) throw new Error(`Model file not found: ${options.modelPath}`)
    if (path.extname(options.modelPath).toLowerCase() !== '.stl') {
      throw new Error('Centauri Carbon slicing currently supports STL files only.')
    }
    if (options.nozzleSize !== 0.4) {
      throw new Error('Only the verified Centauri Carbon 0.4 mm profile is currently enabled.')
    }
    const material = options.filamentMaterial.trim().toUpperCase()
    const isGeneric = /generic/i.test(`${options.filamentName ?? ''} ${options.filamentId ?? ''}`)
    const filamentPreset = isGeneric
      ? this.GENERIC_FILAMENT_PRESETS[material]
      : this.FILAMENT_PRESETS[material]
    if (!filamentPreset) {
      const profileKind = isGeneric ? 'generic' : 'Elegoo'
      const supported = Object.keys(isGeneric ? this.GENERIC_FILAMENT_PRESETS : this.FILAMENT_PRESETS)
      throw new Error(`No ${profileKind} Centauri Carbon profile is configured for ${options.filamentMaterial || 'the selected filament'}. Supported materials: ${supported.join(', ')}.`)
    }

    const profileRoot = path.join(this.INSTALL_DIRECTORY, 'resources', 'profiles', 'Elegoo')
    const machine = path.join(profileRoot, 'machine', 'ECC', 'Elegoo Centauri Carbon 0.4 nozzle.json')
    const process = path.join(profileRoot, 'process', 'ECC', '0.20mm Standard @Elegoo CC 0.4 nozzle.json')
    const filamentDirectory = filamentPreset.startsWith('Generic ') ? 'Generic' : 'ECC'
    const filament = path.join(profileRoot, 'filament', filamentDirectory, filamentPreset)
    for (const profile of [machine, process, filament]) {
      if (!fs.existsSync(profile)) throw new Error(`Required official ElegooSlicer profile not found: ${profile}`)
    }

    fs.mkdirSync(options.outputDirectory, { recursive: true })
    const before = new Set(fs.readdirSync(options.outputDirectory))
    const args = [
      '--load-settings', `${machine};${process}`,
      '--load-filaments', filament,
      '--slice', '0',
      '--outputdir', options.outputDirectory,
      options.modelPath,
    ]

    await new Promise<void>((resolve, reject) => {
      execFile(executable, args, { windowsHide: true, timeout: 10 * 60 * 1000, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`ElegooSlicer failed: ${stderr.trim() || stdout.trim() || error.message}`))
          return
        }
        resolve()
      })
    })

    const candidates = fs.readdirSync(options.outputDirectory)
      .filter((name) => name.toLowerCase().endsWith('.gcode') && !before.has(name))
      .map((name) => path.join(options.outputDirectory, name))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
    const outputPath = candidates[0]
    if (!outputPath || fs.statSync(outputPath).size === 0) {
      throw new Error('ElegooSlicer completed without producing a G-code file.')
    }
    return outputPath
  }
}

export default ElegooSlicerService
