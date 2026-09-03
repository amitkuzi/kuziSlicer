/**
 * Plugin Host Client — manages lifecycle + communication with kuziSlicer.PluginHost process.
 * Spawns/kills .NET service, wraps REST/SSE calls.
 */

import { spawn, ChildProcess } from 'child_process'
import axios, { AxiosInstance } from 'axios'
import * as fs from 'fs'
import * as path from 'path'
import { EventEmitter } from 'events'

export interface PluginInvokeOptions {
  timeout?: number
  stream?: boolean // if true, returns SSE stream instead of single result
}

export interface PluginInvokeResult {
  success: boolean
  result?: unknown
  error?: string
}

export class PluginHostClient extends EventEmitter {
  private process: ChildProcess | null = null
  private httpClient: AxiosInstance | null = null
  private baseUrl: string = 'http://localhost:5001'
  private isRunning: boolean = false
  private hostExePath: string

  constructor(hostExePath?: string) {
    super()
    // Default to bundled PluginHost.exe in app resources (set after build)
    this.hostExePath =
      hostExePath ||
      path.join(
        process.resourcesPath || process.cwd(),
        'kuziSlicer.PluginHost',
        'PluginHost.exe'
      )
  }

  /**
   * Start PluginHost process.
   * Retries up to 3 times if startup fails.
   */
  async start(): Promise<void> {
    if (this.isRunning) return

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[PluginHostClient] Starting (attempt ${attempt}/3)...`)
        await this._spawn()
        await this._waitForHealthy(5000)
        this.isRunning = true
        this.emit('started')
        return
      } catch (err) {
        console.error(
          `[PluginHostClient] Start attempt ${attempt} failed:`,
          err instanceof Error ? err.message : err
        )
        await this._kill()
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 1000 * attempt))
        }
      }
    }

    throw new Error('Failed to start PluginHost after 3 attempts')
  }

  /**
   * Stop PluginHost process gracefully, with timeout fallback to kill.
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return
    try {
      await axios.post(`${this.baseUrl}/api/shutdown`, {}, { timeout: 2000 })
    } catch {
      // ignore if already stopped
    }
    await this._kill()
    this.isRunning = false
    this.emit('stopped')
  }

  /**
   * Invoke plugin by ID.
   * Returns result or streams progress events (if stream: true).
   */
  async invokePlugin(
    pluginId: string,
    request: unknown,
    opts?: PluginInvokeOptions
  ): Promise<unknown> {
    if (!this.isRunning || !this.httpClient) {
      throw new Error('PluginHost not running')
    }

    const timeout = opts?.timeout ?? 30000

    try {
      const response = await this.httpClient.post(
        `/api/plugins/${pluginId}/invoke`,
        request,
        { timeout }
      )
      return response.data
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`Plugin invocation failed: ${msg}`)
    }
  }

  /**
   * Stream plugin progress via Server-Sent Events.
   * Emits 'progress' events to callback.
   */
  async streamPluginProgress(
    pluginId: string,
    request: unknown,
    onProgress: (event: unknown) => void,
    opts?: PluginInvokeOptions
  ): Promise<unknown> {
    if (!this.isRunning) {
      throw new Error('PluginHost not running')
    }

    const timeout = opts?.timeout ?? 120000

    return new Promise((resolve, reject) => {
      const eventSource = new EventSource(
        `${this.baseUrl}/api/plugins/${pluginId}/stream?request=${encodeURIComponent(JSON.stringify(request))}`
      )

      const timeoutHandle = setTimeout(() => {
        eventSource.close()
        reject(new Error('Stream timeout'))
      }, timeout)

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          onProgress(data)
          if (data.type === 'complete') {
            clearTimeout(timeoutHandle)
            eventSource.close()
            resolve(data.result)
          }
        } catch (err) {
          console.error('[PluginHostClient] Parse error:', err)
        }
      }

      eventSource.onerror = (err) => {
        clearTimeout(timeoutHandle)
        eventSource.close()
        reject(new Error(`Stream error: ${err}`))
      }
    })
  }

  /**
   * List loaded plugins.
   */
  async listPlugins(): Promise<Array<{ id: string; name: string; version: string }>> {
    if (!this.isRunning || !this.httpClient) {
      return []
    }

    try {
      const response = await this.httpClient.get('/api/plugins', { timeout: 5000 })
      return response.data || []
    } catch (err) {
      console.error('[PluginHostClient] List plugins failed:', err)
      return []
    }
  }

  private async _spawn(): Promise<void> {
    if (!fs.existsSync(this.hostExePath)) {
      throw new Error(`PluginHost executable not found: ${this.hostExePath}`)
    }

    this.process = spawn(this.hostExePath, ['--port', '5001'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    })

    this.process.stdout?.on('data', (data) => {
      console.log(`[PluginHost stdout] ${data.toString().trim()}`)
    })

    this.process.stderr?.on('data', (data) => {
      console.error(`[PluginHost stderr] ${data.toString().trim()}`)
    })

    this.process.on('exit', (code) => {
      console.log(`[PluginHost] Process exited with code ${code}`)
      this.isRunning = false
      this.emit('crashed', code)
    })

    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 5000,
    })
  }

  private async _kill(): Promise<void> {
    if (!this.process) return

    return new Promise((resolve) => {
      const timeoutHandle = setTimeout(() => {
        if (this.process?.pid) {
          process.kill(-this.process.pid, 'SIGKILL')
        }
        resolve()
      }, 2000)

      this.process!.on('exit', () => {
        clearTimeout(timeoutHandle)
        this.process = null
        resolve()
      })

      if (this.process.pid) {
        process.kill(-this.process.pid, 'SIGTERM')
      }
    })
  }

  private async _waitForHealthy(timeout: number): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      try {
        await axios.get(`${this.baseUrl}/health`, { timeout: 1000 })
        return
      } catch {
        await new Promise((r) => setTimeout(r, 200))
      }
    }
    throw new Error('PluginHost health check timeout')
  }
}

export default PluginHostClient
