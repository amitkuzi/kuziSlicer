/**
 * Plugin Manager — orchestrates plugin lifecycle and IPC to PluginHost.
 * Loads/enables/disables plugins, routes invocations to PluginHost client.
 */

import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import PluginHostClient from '../clients/pluginHostClient'
import type { PluginManifest } from '../../types/plugin-manifest'
import { validateManifest } from '../../types/plugin-manifest'

export interface PluginInfo {
  id: string
  manifest: PluginManifest
  enabled: boolean
  path: string
}

export class PluginManager {
  private hostClient: PluginHostClient
  private plugins: Map<string, PluginInfo> = new Map()
  private configPath: string

  constructor(hostClient: PluginHostClient) {
    this.hostClient = hostClient
    this.configPath = path.join(app.getPath('userData'), 'plugins.json')
  }

  /**
   * Load plugins from bundled directory and user directory.
   */
  async load(): Promise<void> {
    const bundledPath = path.join(process.resourcesPath || process.cwd(), 'plugins')
    const userPath = path.join(app.getPath('userData'), 'plugins')

    for (const dir of [bundledPath, userPath]) {
      if (!fs.existsSync(dir)) continue
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const manifestPath = path.join(dir, entry.name, 'manifest.json')
        if (!fs.existsSync(manifestPath)) continue

        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
          if (!validateManifest(manifest)) {
            console.warn(`[PluginManager] Invalid manifest: ${manifestPath}`)
            continue
          }
          const id = `${manifest.name}@${manifest.version}`
          this.plugins.set(id, {
            id,
            manifest,
            enabled: true,
            path: path.join(dir, entry.name),
          })
        } catch (err) {
          console.error(`[PluginManager] Failed to load plugin ${entry.name}:`, err)
        }
      }
    }

    console.log(`[PluginManager] Loaded ${this.plugins.size} plugins`)
  }

  /**
   * Get list of loaded plugins.
   */
  getPlugins(): PluginInfo[] {
    return Array.from(this.plugins.values())
  }

  /**
   * Enable/disable plugin (in-memory only; persisted to config on save).
   */
  setPluginEnabled(id: string, enabled: boolean): void {
    const plugin = this.plugins.get(id)
    if (plugin) {
      plugin.enabled = enabled
    }
  }

  /**
   * Get plugin info.
   */
  getPlugin(id: string): PluginInfo | undefined {
    return this.plugins.get(id)
  }

  /**
   * Save enabled state to config file.
   */
  saveConfig(): void {
    const config: Record<string, boolean> = {}
    for (const [id, info] of this.plugins) {
      config[id] = info.enabled
    }
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8')
  }

  /**
   * Load enabled state from config file.
   */
  loadConfig(): void {
    if (!fs.existsSync(this.configPath)) return
    try {
      const config = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'))
      for (const [id, enabled] of Object.entries(config)) {
        const plugin = this.plugins.get(id)
        if (plugin) {
          plugin.enabled = enabled as boolean
        }
      }
    } catch (err) {
      console.error('[PluginManager] Failed to load config:', err)
    }
  }

  /**
   * Invoke plugin via PluginHost.
   */
  async invokePlugin(id: string, request: unknown, timeout?: number): Promise<unknown> {
    const plugin = this.plugins.get(id)
    if (!plugin || !plugin.enabled) {
      throw new Error(`Plugin not found or disabled: ${id}`)
    }
    return this.hostClient.invokePlugin(id, request, { timeout })
  }

  /**
   * Stream plugin progress via SSE.
   */
  async streamPlugin(
    id: string,
    request: unknown,
    onProgress: (event: unknown) => void,
    timeout?: number
  ): Promise<unknown> {
    const plugin = this.plugins.get(id)
    if (!plugin || !plugin.enabled) {
      throw new Error(`Plugin not found or disabled: ${id}`)
    }
    return this.hostClient.streamPluginProgress(id, request, onProgress, { timeout })
  }
}

export default PluginManager
