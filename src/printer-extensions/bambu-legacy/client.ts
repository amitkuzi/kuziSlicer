/** Legacy package construction for offline compatibility tests only. Hardware dispatch
 * requires the A1 mini extension and the original native sliced project. */
import * as path from 'path'
import * as fs from 'fs'
import * as crypto from 'crypto'
import { unzipSync, zipSync, strToU8 } from 'fflate'

export interface BambuPrintOptions {
  ip: string
  accessCode: string
  serialNumber: string
  gcode: string
  fileName: string
}

export interface BambuPrintResult {
  success: boolean
  message: string
}

export class BambuPrinterClient {
  private static readonly TEMPLATE_ENTRY = 'Metadata/plate_1.gcode'
  private static readonly TEMPLATE_MD5_ENTRY = 'Metadata/plate_1.gcode.md5'

  /**
   * Package the G-code into a .gcode.3mf project file, upload it via FTPS, and
   * issue an MQTT print command for it.
   */
  static async uploadAndPrint(opts: BambuPrintOptions): Promise<BambuPrintResult> {
    return { success: false, message: 'Use the rapid printer extension with an original sliced .gcode.3mf project. Raw G-code template replacement is not validated for hardware printing.' }
  }

  /**
   * Build a .gcode.3mf package by cloning the bundled template and replacing
   * only the G-code payload and its checksum.
   */
  static buildProjectFile(gcode: string): Buffer {
    const templatePath = this.resolveTemplatePath()
    const templateBuffer = fs.readFileSync(templatePath)
    const entries = unzipSync(templateBuffer)

    if (!entries[this.TEMPLATE_ENTRY]) {
      throw new Error(`Template package is missing ${this.TEMPLATE_ENTRY}`)
    }

    const gcodeBytes = strToU8(gcode)
    const md5 = crypto.createHash('md5').update(gcode, 'utf-8').digest('hex').toUpperCase()

    entries[this.TEMPLATE_ENTRY] = gcodeBytes
    entries[this.TEMPLATE_MD5_ENTRY] = strToU8(md5)

    return Buffer.from(zipSync(entries, { level: 6 }))
  }

  private static resolveTemplatePath(): string {
    const devPath = path.join(process.cwd(), 'src', 'printer-extensions', 'bambu-legacy', 'template.gcode.3mf')
    const prodPath = path.join(process.resourcesPath || process.cwd(), 'printer-extensions', 'bambu-legacy', 'template.gcode.3mf')
    return fs.existsSync(devPath) ? devPath : prodPath
  }

}

export default BambuPrinterClient
