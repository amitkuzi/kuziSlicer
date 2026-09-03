import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import * as fs from 'fs'
import { GcodeGenerator, PrinterProfile, FilamentProfile, PrintSettings } from './services/gcodeGenerator'
import PluginHostClient from './clients/pluginHostClient'
import PluginManager from './services/pluginManager'
import ProfilesManager from './services/profilesManager'
import ProfilesAccessor from './services/profilesAccessor'
import { ConfiguredPrinter } from '../types/ipc'

let mainWindow: BrowserWindow | null = null
let pluginHostClient: PluginHostClient | null = null
let pluginManager: PluginManager | null = null

const isDev = process.env.NODE_ENV === 'development'
const userDataPath = app.getPath('userData')
const printersDataPath = path.join(userDataPath, 'printers.json')
const settingsDataPath = path.join(userDataPath, 'settings.json')

// ============================================================
// Helpers
// ============================================================

function loadConfiguredPrinters(): ConfiguredPrinter[] {
  try {
    if (fs.existsSync(printersDataPath)) {
      const data = fs.readFileSync(printersDataPath, 'utf-8')
      return JSON.parse(data)
    }
  } catch (err) {
    console.error('[Main] Load configured printers failed:', err)
  }
  return []
}

function saveConfiguredPrinters(printers: ConfiguredPrinter[]): void {
  try {
    fs.writeFileSync(printersDataPath, JSON.stringify(printers, null, 2), 'utf-8')
  } catch (err) {
    console.error('[Main] Save configured printers failed:', err)
  }
}

function generatePrinterId(): string {
  return 'printer_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
}

function loadSettings(): Record<string, unknown> {
  try {
    if (fs.existsSync(settingsDataPath)) {
      return JSON.parse(fs.readFileSync(settingsDataPath, 'utf-8'))
    }
  } catch (err) {
    console.error('[Main] Load settings failed:', err)
  }
  return {}
}

function saveSettings(settings: Record<string, unknown>): void {
  try {
    fs.writeFileSync(settingsDataPath, JSON.stringify(settings, null, 2), 'utf-8')
  } catch (err) {
    console.error('[Main] Save settings failed:', err)
  }
}

// ============================================================
// IPC Handlers — G-code
// ============================================================

ipcMain.handle('gcode:generate', async (_event, modelPath: string, printerName: string, filamentName: string, settings: PrintSettings) => {
  const printers = GcodeGenerator.getPrinterProfiles()
  const filaments = GcodeGenerator.getFilamentProfiles()
  const printer = printers.find((p) => p.name === printerName)
  const filament = filaments.find((f) => f.name === filamentName)

  if (!printer) throw new Error(`Printer "${printerName}" not found`)
  if (!filament) throw new Error(`Filament "${filamentName}" not found`)

  const gcode = await GcodeGenerator.generate({
    modelPath,
    printerProfile: printer,
    filamentProfile: filament,
    settings,
  })

  const tempDir = path.join(app.getPath('temp'), 'kuziSlicer')
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true })

  const gcodeFilePath = path.join(tempDir, `print_${Date.now()}.gcode`)
  fs.writeFileSync(gcodeFilePath, gcode)
  return gcodeFilePath
})

ipcMain.handle('gcode:printers', async () => {
  return GcodeGenerator.getPrinterProfiles()
})

ipcMain.handle('gcode:filaments', async () => {
  return GcodeGenerator.getFilamentProfiles()
})

ipcMain.handle('gcode:estimate-time', async (_event, modelPath: string, filamentName: string, settings: PrintSettings) => {
  const filaments = GcodeGenerator.getFilamentProfiles()
  const filament = filaments.find((f) => f.name === filamentName)
  if (!filament) throw new Error(`Filament "${filamentName}" not found`)
  return GcodeGenerator.estimatePrintTime(modelPath, filament, settings)
})

ipcMain.handle('gcode:estimate-weight', async (_event, modelPath: string, filamentName: string, settings: PrintSettings) => {
  const filaments = GcodeGenerator.getFilamentProfiles()
  const filament = filaments.find((f) => f.name === filamentName)
  if (!filament) throw new Error(`Filament "${filamentName}" not found`)
  return GcodeGenerator.estimateFilamentWeight(modelPath, filament, settings)
})

// ============================================================
// IPC Handlers — Printer Management
// ============================================================

ipcMain.handle('printer:list', async () => {
  // Phase 3: will call Bonjour discovery. For now, empty.
  return []
})

ipcMain.handle('gcode:send', async (_event, data: { printer: string; gcode: string }) => {
  // Phase 3: will call printer adapter (Klipper/Moonraker). For now, stub.
  console.log(`[Main] Sending G-code to printer: ${data.printer}`)
  return { success: true, message: 'G-code sent successfully' }
})

ipcMain.handle('settings:get', (_event, key: string) => loadSettings()[key])

ipcMain.handle('settings:set', (_event, key: string, value: unknown) => {
  const settings = loadSettings()
  settings[key] = value
  saveSettings(settings)
})

ipcMain.handle('printer:configured:list', () => loadConfiguredPrinters())

ipcMain.handle('printer:configured:add', (_event, printer: Omit<ConfiguredPrinter, 'id' | 'status' | 'lastConnected'>) => {
  const printers = loadConfiguredPrinters()
  const newPrinter: ConfiguredPrinter = {
    ...printer,
    id: generatePrinterId(),
    status: 'unknown',
    lastConnected: new Date().toISOString(),
  }
  printers.push(newPrinter)
  saveConfiguredPrinters(printers)
  return newPrinter
})

ipcMain.handle('printer:configured:update', (_event, id: string, updates: Partial<ConfiguredPrinter>): ConfiguredPrinter => {
  const printers = loadConfiguredPrinters()
  const index = printers.findIndex((p) => p.id === id)
  if (index === -1) throw new Error('Printer not found')
  printers[index] = { ...printers[index], ...updates, id, lastConnected: new Date().toISOString() }
  saveConfiguredPrinters(printers)
  return printers[index]
})

ipcMain.handle('printer:configured:delete', (_event, id: string) => {
  saveConfiguredPrinters(loadConfiguredPrinters().filter((p) => p.id !== id))
})

ipcMain.handle('printer:test-connection', (_event, _ipAddress: string) => {
  // Phase 3: test real connection. For now, stub.
  return true
})

// ============================================================
// IPC Handlers — File I/O
// ============================================================

ipcMain.handle('file:open', async (_event, options?: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => {
  return dialog.showOpenDialog(mainWindow!, {
    defaultPath: options?.defaultPath,
    filters: options?.filters || [{ name: 'STL', extensions: ['stl'] }, { name: 'All', extensions: ['*'] }],
    properties: ['openFile'],
  })
})

ipcMain.handle('file:read', async (_event, filePath: string) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return { success: true, content }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('file:read-binary', async (_event, filePath: string) => {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: `File not found: ${filePath}` }
    }
    const buffer = fs.readFileSync(filePath)
    return { success: true, data: new Uint8Array(buffer), name: path.basename(filePath) }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// ============================================================
// IPC Handlers — Profile Management
// ============================================================

ipcMain.handle('profiles:export-yaml', async (_event, targetPath?: string) => {
  try {
    const savePath = targetPath || path.join(app.getPath('documents'), 'kuziSlicer-profiles.yaml')
    const data = ProfilesManager.loadProfiles()
    ProfilesAccessor.writeYaml(savePath, { printers: [...data.printers], filaments: [...data.filaments] })
    return { success: true, path: savePath }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('profiles:import-file', async (_event, filePath: string) => {
  try {
    const data = ProfilesManager.importFromFile(filePath)
    return { success: true, printers: [...data.printers], filaments: [...data.filaments] }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('profiles:import-github', async (_event, owner: string, repo: string, branch = 'main', filePath = 'profiles.yaml') => {
  try {
    const data = await ProfilesManager.importFromGithub(owner, repo, branch, filePath)
    return { success: true, printers: [...data.printers], filaments: [...data.filaments] }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('profiles:import-url', async (_event, url: string) => {
  try {
    const data = await ProfilesManager.importFromUrl(url)
    return { success: true, printers: [...data.printers], filaments: [...data.filaments] }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// ============================================================
// IPC Handlers — Plugins (Phase 0.3 + 0.7)
// ============================================================

ipcMain.handle('plugin:list', async () => {
  return pluginManager?.getPlugins() || []
})

ipcMain.handle('plugin:invoke', async (_event, pluginId: string, request: unknown) => {
  if (!pluginManager) throw new Error('Plugin manager not initialized')
  return pluginManager.invokePlugin(pluginId, request)
})

ipcMain.handle('plugin:stream', async (_event, pluginId: string, request: unknown, onProgress?: (event: unknown) => void) => {
  if (!pluginManager) throw new Error('Plugin manager not initialized')
  return pluginManager.streamPlugin(pluginId, request, onProgress || (() => {}))
})

// ============================================================
// Window + Lifecycle
// ============================================================

function createWindow() {
  console.log('[Main] Creating window... isDev:', isDev)

  const getIconPath = () => {
    const devPath = path.join(process.cwd(), 'brandkit/icons/kuzislicer/icon-1024.png')
    const prodPath = path.join(process.resourcesPath, 'brandkit/icons/kuzislicer/icon-1024.png')
    if (fs.existsSync(devPath)) return devPath
    if (fs.existsSync(prodPath)) return prodPath
    return undefined
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 600,
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
    },
  })

  const startUrl = isDev ? 'http://localhost:3000' : `file://${path.join(__dirname, 'index.html')}`

  console.log('[Main] Loading URL:', startUrl)
  mainWindow.loadURL(startUrl).catch((err) => {
    console.error('[Main] Failed to load URL:', err)
  })

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('[Main] Page failed to load:', errorCode, errorDescription)
  })

  mainWindow.webContents.on('crashed', () => {
    console.error('[Main] Renderer process crashed')
  })

  if (isDev) {
    mainWindow.webContents.openDevTools()
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

async function initializeServices() {
  try {
    // TODO: Phase 2 — Initialize PluginHost client
    // pluginHostClient = new PluginHostClient()
    // await pluginHostClient.start()
    // console.log('[Main] PluginHost started')

    // Initialize GcodeGenerator (Phase 0: without PluginHost)
    await GcodeGenerator.initialize()
    console.log('[Main] GcodeGenerator initialized')

    // TODO: Phase 2 — Initialize PluginManager
    // pluginManager = new PluginManager(pluginHostClient)
    // await pluginManager.load()
    // pluginManager.loadConfig()
    // console.log(`[Main] Loaded ${pluginManager.getPlugins().length} plugins`)
  } catch (err) {
    console.error('[Main] Service initialization failed:', err)
    // Don't crash the app; plugins are optional in Phase 0
  }
}

app.whenReady().then(async () => {
  await initializeServices()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})

app.on('before-quit', async () => {
  console.log('[Main] Shutting down')
  if (pluginManager) {
    pluginManager.saveConfig()
  }
  if (pluginHostClient) {
    await pluginHostClient.stop()
  }
})
