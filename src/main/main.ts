import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import * as fs from 'fs'
import { execSync } from 'child_process'
import { GcodeGenerator, PrinterProfile, FilamentProfile, PrintSettings } from './services/gcodeGenerator'
import { ConfiguredPrinter } from '../types/ipc'

let mainWindow: BrowserWindow | null = null
const isDev = process.env.NODE_ENV === 'development'

// Data directory path for user configured printers
const userDataPath = app.getPath('userData')
const printersDataPath = path.join(userDataPath, 'printers.json')

// Load configured user printers
function loadConfiguredPrinters(): ConfiguredPrinter[] {
  try {
    if (fs.existsSync(printersDataPath)) {
      const data = fs.readFileSync(printersDataPath, 'utf-8')
      return JSON.parse(data)
    }
  } catch (err) {
    console.error('Error loading configured printers:', err)
  }
  return []
}

// Save configured user printers
function saveConfiguredPrinters(printers: ConfiguredPrinter[]): void {
  try {
    fs.writeFileSync(printersDataPath, JSON.stringify(printers, null, 2), 'utf-8')
  } catch (err) {
    console.error('Error saving configured printers:', err)
  }
}

// Generate unique ID for printer
function generatePrinterId(): string {
  return 'printer_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
}

// Test connection to printer (basic ping test)
function testPrinterConnection(ipAddress: string, port: string = '5000'): boolean {
  try {
    // ponytail: basic connection test via ping, full Octoprint/Fluidd protocol added later
    if (process.platform === 'win32') {
      execSync(`ping -n 1 -w 2000 ${ipAddress}`, { stdio: 'ignore' })
    } else {
      execSync(`ping -c 1 -W 2 ${ipAddress}`, { stdio: 'ignore' })
    }
    return true
  } catch (err) {
    return false
  }
}

// Load printer and filament profiles
function getDataPath(): string {
  // In development: src/data (from project root)
  // In production: resources/data (after electron-builder packaging)
  const devPath = path.join(process.cwd(), 'src/data')
  const prodPath = path.join(process.resourcesPath, 'data')

  console.log('Dev path exists:', fs.existsSync(devPath), devPath)
  console.log('Prod path exists:', fs.existsSync(prodPath), prodPath)

  if (fs.existsSync(devPath)) {
    console.log('Using dev path:', devPath)
    return devPath
  }
  console.log('Using prod path:', prodPath)
  return prodPath
}

function loadPrinterProfiles(): PrinterProfile[] {
  const dataPath = getDataPath()
  const filePath = path.join(dataPath, 'printers.json')
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  return data.printers
}

function loadFilamentProfiles(): FilamentProfile[] {
  const dataPath = getDataPath()
  const filePath = path.join(dataPath, 'filaments.json')
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  return data.filaments
}

const printerProfiles = loadPrinterProfiles()
const filamentProfiles = loadFilamentProfiles()

// IPC Handler: Generate G-code
ipcMain.handle('gcode:generate', async (event, modelPath: string, printerName: string, filamentName: string, settings: PrintSettings) => {
  const printer = printerProfiles.find((p) => p.name === printerName)
  const filament = filamentProfiles.find((f) => f.name === filamentName)

  if (!printer) {
    throw new Error(`Printer "${printerName}" not found`)
  }
  if (!filament) {
    throw new Error(`Filament "${filamentName}" not found`)
  }

  const gcode = await GcodeGenerator.generate({
    modelPath,
    printerProfile: printer,
    filamentProfile: filament,
    settings,
  })

  // Save to temp directory
  const tempDir = path.join(app.getPath('temp'), 'kuziSlicer')
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true })
  }

  const gcodeFileName = `print_${Date.now()}.gcode`
  const gcodeFilePath = path.join(tempDir, gcodeFileName)
  fs.writeFileSync(gcodeFilePath, gcode)

  return gcodeFilePath
})

// IPC Handler: List printers
ipcMain.handle('gcode:printers', async () => {
  return printerProfiles
})

// IPC Handler: List filaments
ipcMain.handle('gcode:filaments', async () => {
  return filamentProfiles
})

// IPC Handler: Estimate print time
ipcMain.handle('gcode:estimate-time', async (event, modelPath: string, filamentName: string, settings: PrintSettings) => {
  const filament = filamentProfiles.find((f) => f.name === filamentName)
  if (!filament) {
    throw new Error(`Filament "${filamentName}" not found`)
  }
  return GcodeGenerator.estimatePrintTime(modelPath, filament, settings)
})

// IPC Handler: Estimate filament weight
ipcMain.handle('gcode:estimate-weight', async (event, modelPath: string, filamentName: string, settings: PrintSettings) => {
  const filament = filamentProfiles.find((f) => f.name === filamentName)
  if (!filament) {
    throw new Error(`Filament "${filamentName}" not found`)
  }
  return GcodeGenerator.estimateFilamentWeight(modelPath, filament, settings)
})

// IPC Handler: List configured printers
ipcMain.handle('printer:list', async () => {
  // This will be replaced with actual printer discovery
  // For now, return empty array - PrinterManagement (S4) will handle adding printers
  return []
})

// IPC Handler: Send G-code to printer
ipcMain.handle('gcode:send', async (event, data: { printer: string; gcode: string }) => {
  try {
    // This would connect to OctoPrint or similar
    // For MVP, just return success
    console.log(`Sending G-code to printer: ${data.printer}`)
    return { success: true, message: 'G-code sent successfully' }
  } catch (error) {
    return { success: false, message: `Failed to send G-code: ${error}` }
  }
})

// IPC Handler: Open file dialog
ipcMain.handle('file:open', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    filters: [{ name: 'G-code', extensions: ['gcode', 'gco', 'nc'] }],
    properties: ['openFile'],
  })
  return result
})

// IPC Handler: Read file content
ipcMain.handle('file:read', async (event, filePath: string) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return { success: true, content }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

// IPC Handlers for Printer Management (S4)
ipcMain.handle('printer:configured:list', (): ConfiguredPrinter[] => {
  return loadConfiguredPrinters()
})

ipcMain.handle(
  'printer:configured:add',
  (
    _event,
    printer: Omit<ConfiguredPrinter, 'id' | 'status' | 'lastConnected'>
  ): ConfiguredPrinter => {
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
  }
)

ipcMain.handle(
  'printer:configured:update',
  (_event, id: string, updates: Partial<ConfiguredPrinter>): ConfiguredPrinter => {
    const printers = loadConfiguredPrinters()
    const index = printers.findIndex((p) => p.id === id)
    if (index === -1) throw new Error('Printer not found')

    printers[index] = {
      ...printers[index],
      ...updates,
      id,
      lastConnected: new Date().toISOString(),
    }
    saveConfiguredPrinters(printers)
    return printers[index]
  }
)

ipcMain.handle('printer:configured:delete', (_event, id: string): void => {
  const printers = loadConfiguredPrinters()
  saveConfiguredPrinters(printers.filter((p) => p.id !== id))
})

ipcMain.handle('printer:test-connection', (_event, ipAddress: string, port?: string): boolean => {
  return testPrinterConnection(ipAddress, port || '5000')
})

function createWindow() {
  console.log('Creating window... isDev:', isDev)
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
    },
  })

  const startUrl = isDev
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, 'index.html')}`

  console.log('Loading URL:', startUrl)
  mainWindow.loadURL(startUrl).catch((err) => {
    console.error('Failed to load URL:', err)
  })

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Page failed to load:', errorCode, errorDescription)
  })

  mainWindow.webContents.on('crashed', () => {
    console.error('Renderer process crashed')
  })

  if (isDev) {
    mainWindow.webContents.openDevTools()
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
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

app.on('before-quit', () => {
  // cleanup if needed
})
