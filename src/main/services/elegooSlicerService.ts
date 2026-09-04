import { execFile } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

export interface ElegooSliceOptions {
  modelPath: string
  outputDirectory: string
  nozzleSize: number
  filamentMaterial: string
}

export class ElegooSlicerService {
  private static readonly INSTALL_DIRECTORY = 'C:\\Program Files\\ElegooSlicer'

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
    if (options.filamentMaterial.toUpperCase() !== 'PLA') {
      throw new Error('Only the verified Elegoo PLA profile is currently enabled for direct Centauri Carbon slicing.')
    }

    const profileRoot = path.join(this.INSTALL_DIRECTORY, 'resources', 'profiles', 'Elegoo')
    const machine = path.join(profileRoot, 'machine', 'ECC', 'Elegoo Centauri Carbon 0.4 nozzle.json')
    const process = path.join(profileRoot, 'process', 'ECC', '0.20mm Standard @Elegoo CC 0.4 nozzle.json')
    const filament = path.join(profileRoot, 'filament', 'ECC', 'Elegoo PLA @ECC.json')
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
