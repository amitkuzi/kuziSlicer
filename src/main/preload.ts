import { contextBridge, ipcRenderer } from 'electron'

// Expose IPC channels to renderer
contextBridge.exposeInMainWorld('electron', {
  // Invoke methods (async)
  invoke: (channel: string, ...args: unknown[]) => {
    const validChannels = [
      'printer:list',
      'file:open',
      'file:read',
      'file:read-binary',
      'gcode:send',
      'gcode:generate',
      'gcode:printers',
      'gcode:filaments',
      'gcode:estimate-time',
      'gcode:estimate-weight',
      'settings:get',
      'settings:set',
      'printer:configured:list',
      'printer:configured:add',
      'printer:configured:update',
      'printer:configured:delete',
      'printer:test-connection',
      'profiles:export-yaml',
      'profiles:import-file',
      'profiles:import-github',
      'profiles:import-url',
      'profiles:merge',
      'printer:bambu-print',
      'printer:elegoo-print',
      'printer:elegoo-snapshot',
    ]
    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args)
    }
    throw new Error(`Invalid channel: ${channel}`)
  },

  // Send methods (fire and forget)
  send: (channel: string, ...args: unknown[]) => {
    const validChannels = ['app:minimize', 'app:maximize', 'app:close']
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, ...args)
    } else {
      throw new Error(`Invalid channel: ${channel}`)
    }
  },

  // Listen for events from main process
  on: (channel: string, listener: (...args: unknown[]) => void) => {
    const validChannels = ['printer:connected', 'printer:disconnected', 'app:update']
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => listener(...args))
    } else {
      throw new Error(`Invalid channel: ${channel}`)
    }
  },

  // Remove listeners
  off: (channel: string, listener: (...args: unknown[]) => void) => {
    const validChannels = ['printer:connected', 'printer:disconnected', 'app:update']
    if (validChannels.includes(channel)) {
      ipcRenderer.off(channel, (event, ...args) => listener(...args))
    }
  },
})

declare global {
  interface Window {
    electron: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
      send: (channel: string, ...args: unknown[]) => void
      on: (channel: string, listener: (...args: unknown[]) => void) => void
      off: (channel: string, listener: (...args: unknown[]) => void) => void
    }
  }
}
