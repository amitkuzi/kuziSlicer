/**
 * Bambu Lab LAN-mode print client.
 * Bambu firmware (X1/P1/A1 series) locks network control behind LAN Only Mode:
 * an 8-char Access Code + the printer's Serial Number, used for both an FTPS file
 * upload (implicit TLS, port 990, user "bblp") and an MQTT command channel
 * (mqtts, port 8883, same credentials, self-signed cert). This is Bambu's own
 * (unofficial/reverse-engineered but widely used) protocol -- there is no public
 * REST API. Reference: community projects bambulabs_api / bambu-connect.
 *
 * The printer only accepts packaged ".gcode.3mf" project files (confirmed by
 * listing a real unit's storage -- every stored job is one), not a bare .gcode.
 * Building a fully custom package from scratch is a lot of undocumented surface
 * (thumbnails, project/model/slice metadata) to get exactly right, so instead we
 * take a real project file produced by the printer's own ecosystem
 * (src/data/bambu-project-template.gcode.3mf) and only swap the two entries that
 * actually drive what gets printed: Metadata/plate_1.gcode and its .md5 checksum.
 * Everything else (thumbnails, model, settings) stays byte-identical to a
 * known-good file, so the package structure itself can't be the point of failure.
 */
import * as ftp from 'basic-ftp'
import mqtt, { MqttClient } from 'mqtt'
import * as path from 'path'
import * as fs from 'fs'
import * as crypto from 'crypto'
import { Readable } from 'stream'
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
    const remoteFileName = opts.fileName.endsWith('.gcode.3mf')
      ? opts.fileName
      : `${opts.fileName.replace(/\.gcode$/, '')}.gcode.3mf`

    let packageBuffer: Buffer
    try {
      packageBuffer = this.buildProjectFile(opts.gcode)
    } catch (err) {
      return { success: false, message: `Failed to build project package: ${err instanceof Error ? err.message : String(err)}` }
    }

    console.log(`[Bambu] FTPS: uploading ${remoteFileName} (${packageBuffer.length} bytes) to ${opts.ip} ...`)
    try {
      await this.uploadFile(opts.ip, opts.accessCode, packageBuffer, remoteFileName)
      console.log('[Bambu] FTPS: upload complete')
    } catch (err) {
      console.error('[Bambu] FTPS: upload failed:', err)
      return { success: false, message: `FTPS upload failed: ${err instanceof Error ? err.message : String(err)}` }
    }

    try {
      await this.sendPrintCommand(opts.ip, opts.accessCode, opts.serialNumber, remoteFileName)
      console.log('[Bambu] MQTT: print command acknowledged')
    } catch (err) {
      console.error('[Bambu] MQTT: print command failed:', err)
      return { success: false, message: `MQTT print command failed (file was uploaded to the printer as ${remoteFileName}): ${err instanceof Error ? err.message : String(err)}` }
    }

    return { success: true, message: `Uploaded ${remoteFileName} and started printing on ${opts.ip}` }
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
    const devPath = path.join(process.cwd(), 'src', 'data', 'bambu-project-template.gcode.3mf')
    const prodPath = path.join(process.resourcesPath || process.cwd(), 'data', 'bambu-project-template.gcode.3mf')
    return fs.existsSync(devPath) ? devPath : prodPath
  }

  private static async uploadFile(ip: string, accessCode: string, buffer: Buffer, remoteFileName: string): Promise<void> {
    const client = new ftp.Client(20000)
    try {
      await client.access({
        host: ip,
        port: 990,
        user: 'bblp',
        password: accessCode,
        secure: 'implicit',
        secureOptions: { rejectUnauthorized: false }, // Bambu printers use a self-signed cert
      })
      await client.uploadFrom(Readable.from(buffer), remoteFileName)
    } finally {
      client.close()
    }
  }

  private static sendPrintCommand(ip: string, accessCode: string, serialNumber: string, remoteFileName: string): Promise<void> {
    console.log(`[Bambu] MQTT: connecting to mqtts://${ip}:8883 ...`)
    return new Promise((resolve, reject) => {
      const client: MqttClient = mqtt.connect(`mqtts://${ip}:8883`, {
        username: 'bblp',
        password: accessCode,
        rejectUnauthorized: false, // Bambu printers use a self-signed cert, same as Bambu Studio/Orca
        reconnectPeriod: 0,
        connectTimeout: 15000,
      })

      let settled = false
      const settle = (fn: () => void) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        fn()
      }

      // Guards the whole connect+publish sequence -- not just the connect phase --
      // since a hung publish callback (no ack from the printer) is exactly what
      // caused this to hang indefinitely in testing.
      const timeout = setTimeout(() => {
        console.error('[Bambu] MQTT: hard timeout after 20s')
        client.end(true)
        settle(() => reject(new Error('Timed out waiting for the printer to respond (no response after 20s)')))
      }, 20000)

      client.on('close', () => console.log('[Bambu] MQTT: socket closed'))
      client.on('offline', () => console.log('[Bambu] MQTT: client offline'))
      client.on('reconnect', () => console.log('[Bambu] MQTT: reconnecting'))

      client.on('connect', () => {
        console.log('[Bambu] MQTT: connected')
        const requestTopic = `device/${serialNumber}/request`
        const payload = {
          print: {
            sequence_id: '0',
            command: 'project_file',
            param: 'Metadata/plate_1.gcode',
            project_id: '0',
            profile_id: '0',
            task_id: '0',
            subtask_id: '0',
            subtask_name: '',
            file: remoteFileName,
            url: `file:///sdcard/${remoteFileName}`,
            md5: '',
            timelapse: false,
            bed_leveling: true,
            flow_cali: false,
            vibration_cali: false,
            layer_inspect: false,
            use_ams: false,
          },
        }
        console.log('[Bambu] MQTT: publishing print command to', requestTopic)
        // qos:1 waits for a broker PUBACK -- Bambu's firmware doesn't reliably send one
        // on this topic, which hung the publish callback indefinitely. qos:0 (fire and
        // forget) resolves as soon as the packet is written to the socket instead.
        client.publish(requestTopic, JSON.stringify(payload), { qos: 0 }, (err) => {
          console.log('[Bambu] MQTT: publish callback fired', err ? `(error: ${err.message})` : '(ok)')
          client.end(true)
          settle(() => (err ? reject(err) : resolve()))
        })
      })

      client.on('error', (err) => {
        console.error('[Bambu] MQTT: error event:', err.message)
        client.end(true)
        settle(() => reject(err))
      })
    })
  }
}

export default BambuPrinterClient
