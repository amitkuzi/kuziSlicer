import { contextBridge, ipcRenderer } from 'electron'

type Wrapper = (event: unknown, ...args: unknown[]) => void
const wrappers = new WeakMap<(...args: unknown[]) => void, Wrapper>()

// Expose IPC channels to renderer
contextBridge.exposeInMainWorld('electron', {
  // Invoke methods (async)
  invoke: (channel: string, ...args: unknown[]) => {
    const validChannels = [
      'printer:list',
      'printer:extensions',
      'printer:extension-print',
      'printer:extension-status',
      'printer:extension-control',
      'file:open',
      'file:read',
      'file:read-binary',
      'gcode:send',
      'gcode:generate',
      'gcode:printers',
      'gcode:filaments',
      'gcode:infill-patterns',
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

  // Listen for events from main process. The wrapper that strips the IpcRendererEvent is
  // remembered per listener, so off() can actually remove it -- comparing a freshly built
  // wrapper never matches and leaks the listener.
  on: (channel: string, listener: (...args: unknown[]) => void) => {
    const validChannels = ['job:progress', 'printer:connected', 'printer:disconnected', 'app:update']
    if (validChannels.includes(channel)) {
      const wrapper = (_event: unknown, ...args: unknown[]) => listener(...args)
      wrappers.set(listener, wrapper)
      ipcRenderer.on(channel, wrapper)
    } else {
      throw new Error(`Invalid channel: ${channel}`)
    }
  },

  // Remove listeners
  off: (channel: string, listener: (...args: unknown[]) => void) => {
    const wrapper = wrappers.get(listener)
    if (wrapper) {
      ipcRenderer.off(channel, wrapper)
      wrappers.delete(listener)
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
