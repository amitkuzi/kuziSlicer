/**
 * Elegoo Centauri Carbon (CC1) LAN print client -- Smart Device Control
 * Protocol (SDCP) v3, Elegoo's proprietary local control protocol (no
 * public REST API, no access-code auth for the original Centauri Carbon --
 * that's a Centauri Carbon 2 thing, out of scope here).
 *
 * Three independent channels, unlike Bambu's two:
 *  - UDP 3000: discovery probe "M99999" -> JSON with MainboardID (required
 *    for every WebSocket command envelope).
 *  - WebSocket ws://<ip>:3030/websocket: JSON command envelopes (Cmd 128 =
 *    start print, Cmd 0 = status).
 *  - HTTP :80 POST /uploadFile/upload: chunked multipart file transfer,
 *    1 MiB chunks, independent of the control channel so a slow upload can't
 *    stall/crash an in-progress print.
 *  - HTTP :3031 GET /video: MJPEG camera stream (first JPEG frame = snapshot).
 *
 * Protocol details (command codes, envelope shape, upload chunk fields,
 * camera port) taken directly from the pycentauri client
 * (github.com/bjan/pycentauri), which documents them as reverse-engineered
 * from Elegoo's own "elegoo-link" C++ SDK -- not guessed.
 */
import * as dgram from 'dgram'
import WebSocket from 'ws'
import axios from 'axios'
import FormData from 'form-data'
import * as crypto from 'crypto'
import { randomUUID } from 'crypto'

const DISCOVERY_PORT = 3000
const WS_PORT = 3030
const UPLOAD_PORT = 80
const CAMERA_PORT = 3031
const CHUNK_SIZE = 1024 * 1024 // 1 MiB

export interface ElegooPrintOptions {
  ip: string
  gcode: string
  fileName: string
}

export interface ElegooPrintResult {
  success: boolean
  message: string
}

export class ElegooPrinterClient {
  /**
   * Discover a printer at a known IP: unicast the SDCP probe directly
   * (skips broadcast discovery since the IP is already known) and parse the
   * MainboardID out of the JSON reply.
   */
  static discoverMainboardId(ip: string, timeoutMs = 5000): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket('udp4')
      const timeout = setTimeout(() => {
        socket.close()
        reject(new Error(`No SDCP discovery response from ${ip}:${DISCOVERY_PORT} after ${timeoutMs}ms`))
      }, timeoutMs)

      socket.on('message', (msg) => {
        try {
          const obj = JSON.parse(msg.toString('utf-8'))
          const mainboardId: string | undefined = obj?.Data?.MainboardID || obj?.MainboardID
          if (mainboardId) {
            clearTimeout(timeout)
            socket.close()
            resolve(mainboardId)
          }
        } catch {
          // ignore malformed/unrelated UDP traffic
        }
      })

      socket.on('error', (err) => {
        clearTimeout(timeout)
        socket.close()
        reject(err)
      })

      socket.send('M99999', DISCOVERY_PORT, ip)
    })
  }

  /**
   * Upload a G-code file via chunked multipart POST. Returns the remote
   * filename to pass to startPrint.
   */
  static async uploadFile(ip: string, gcode: string, fileName: string): Promise<string> {
    const buffer = Buffer.from(gcode, 'utf-8')
    const md5 = crypto.createHash('md5').update(buffer).digest('hex')
    const uploadId = randomUUID().replace(/-/g, '')
    const total = buffer.length
    const url = `http://${ip}:${UPLOAD_PORT}/uploadFile/upload`

    for (let offset = 0; offset < total; offset += CHUNK_SIZE) {
      const chunk = buffer.subarray(offset, Math.min(offset + CHUNK_SIZE, total))
      const form = new FormData()
      form.append('Check', '1')
      form.append('S-File-MD5', md5)
      form.append('Offset', String(offset))
      form.append('Uuid', uploadId)
      form.append('TotalSize', String(total))
      form.append('File', chunk, { filename: fileName, contentType: 'application/octet-stream' })

      const resp = await axios.post(url, form, {
        headers: form.getHeaders(),
        timeout: 30000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      })
      if (resp.data?.code !== '000000') {
        throw new Error(`Upload chunk at offset ${offset} rejected: ${JSON.stringify(resp.data)}`)
      }
    }

    return fileName
  }

  // Official SDCP_PRINT_CTRL_ACK_* codes for the Cmd 128 response, per
  // docs.opencentauri.cc/software/api/ (community-documented against real
  // firmware -- more authoritative here than pycentauri's payload shape,
  // which turned out to send extra fields this firmware doesn't recognize).
  private static readonly PRINT_ACK_MESSAGES: Record<number, string> = {
    0: 'OK',
    1: 'Printer is busy',
    2: 'File not found on the printer',
    3: 'File MD5 checksum failed',
    4: 'File I/O error on the printer',
    5: 'Invalid resolution',
    6: 'Unknown file format',
    7: 'Unknown model',
  }

  /**
   * Send Cmd 128 (start print) over the SDCP WebSocket. Payload is the
   * minimal documented shape ({Filename, StartLayer}) -- pycentauri's extra
   * fields (Calibration_switch, PrintPlatformType, Tlp_Switch, slot_map,
   * path_prefix) caused this firmware (V0.4.0-o) to reject the command with
   * Ack 2 (NOT_FOUND) even though the file was confirmed present via
   * GET_FILE_LIST.
   */
  static startPrint(ip: string, mainboardId: string, remoteFileName: string, timeoutMs = 15000): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://${ip}:${WS_PORT}/websocket`)

      const timeout = setTimeout(() => {
        console.error('[Elegoo] WebSocket: hard timeout, no response to start-print command')
        ws.terminate()
        reject(new Error('Timed out waiting for the printer to acknowledge the print command'))
      }, timeoutMs)

      ws.on('open', () => {
        console.log('[Elegoo] WebSocket: connected, sending start-print command')
        const requestId = randomUUID().replace(/-/g, '').slice(0, 16)
        const packet = {
          Id: mainboardId,
          Data: {
            Cmd: 128,
            Data: {
              Filename: remoteFileName,
              StartLayer: 0,
            },
            RequestID: requestId,
            MainboardID: mainboardId,
            TimeStamp: Date.now(),
            From: 0,
          },
          Topic: `sdcp/request/${mainboardId}`,
        }
        ws.send(JSON.stringify(packet))
      })

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString())
          console.log('[Elegoo] WebSocket: message received:', JSON.stringify(msg).slice(0, 300))
          if (typeof msg?.Topic === 'string' && msg.Topic.includes('/response/')) {
            const ack = msg?.Data?.Data?.Ack
            clearTimeout(timeout)
            ws.close()
            if (ack === 0) {
              resolve()
            } else {
              const reason = this.PRINT_ACK_MESSAGES[ack] || `unknown Ack code ${ack}`
              reject(new Error(`Printer rejected the print command: ${reason} (Ack=${ack})`))
            }
          }
        } catch {
          // ignore unparseable frames
        }
      })

      ws.on('error', (err) => {
        console.error('[Elegoo] WebSocket: error:', err.message)
        clearTimeout(timeout)
        reject(err)
      })

      ws.on('close', () => console.log('[Elegoo] WebSocket: closed'))
    })
  }

  /**
   * Capture one JPEG frame from the onboard camera's MJPEG stream, for
   * visual confirmation that a print actually started.
   */
  static async captureSnapshot(ip: string, timeoutMs = 10000): Promise<Buffer> {
    const url = `http://${ip}:${CAMERA_PORT}/video`
    const response = await axios.get(url, { responseType: 'stream', timeout: timeoutMs })

    return new Promise((resolve, reject) => {
      const SOI = Buffer.from([0xff, 0xd8])
      const EOI = Buffer.from([0xff, 0xd9])
      let buf = Buffer.alloc(0)
      let start = -1
      const maxBytes = 8 * 1024 * 1024
      const timeout = setTimeout(() => {
        response.data.destroy()
        reject(new Error('Timed out waiting for a full JPEG frame from the camera'))
      }, timeoutMs)

      response.data.on('data', (chunk: Buffer) => {
        buf = Buffer.concat([buf, chunk])
        if (start === -1) start = buf.indexOf(SOI)
        if (start !== -1) {
          const end = buf.indexOf(EOI, start + 2)
          if (end !== -1) {
            clearTimeout(timeout)
            response.data.destroy()
            resolve(buf.subarray(start, end + 2))
          }
        }
        if (buf.length > maxBytes) {
          clearTimeout(timeout)
          response.data.destroy()
          reject(new Error('Camera frame exceeded size cap without completing'))
        }
      })
      response.data.on('error', (err: Error) => {
        clearTimeout(timeout)
        reject(err)
      })
    })
  }

  /**
   * Discover the mainboard ID, upload the G-code, and start the print.
   */
  static async uploadAndPrint(opts: ElegooPrintOptions): Promise<ElegooPrintResult> {
    let mainboardId: string
    console.log(`[Elegoo] Discovering mainboard ID at ${opts.ip} ...`)
    try {
      mainboardId = await this.discoverMainboardId(opts.ip)
      console.log('[Elegoo] Discovered mainboard ID:', mainboardId)
    } catch (err) {
      return { success: false, message: `Discovery failed: ${err instanceof Error ? err.message : String(err)}` }
    }

    console.log(`[Elegoo] Uploading ${opts.fileName} (${opts.gcode.length} bytes) to ${opts.ip} ...`)
    let remoteFileName: string
    try {
      remoteFileName = await this.uploadFile(opts.ip, opts.gcode, opts.fileName)
      console.log('[Elegoo] Upload complete')
    } catch (err) {
      return { success: false, message: `File upload failed: ${err instanceof Error ? err.message : String(err)}` }
    }

    try {
      await this.startPrint(opts.ip, mainboardId, remoteFileName)
      console.log('[Elegoo] Print command acknowledged')
    } catch (err) {
      return {
        success: false,
        message: `Start-print command failed (file was uploaded to the printer as ${remoteFileName}): ${err instanceof Error ? err.message : String(err)}`,
      }
    }

    return { success: true, message: `Uploaded ${remoteFileName} and started printing on ${opts.ip}` }
  }
}

export default ElegooPrinterClient
