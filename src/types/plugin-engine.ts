/**
 * Engine Plugin Interface — slicing (STL → layers → gcode).
 * Plugins of type "engine" conform to this contract.
 */

import type { PrinterProfile, FilamentProfile, PrintSettings } from './ipc'

/**
 * Input to engine plugin: parsed STL geometry + settings.
 */
export interface EngineInvokeRequest {
  /**
   * STL as binary buffer (base64-encoded when passed over JSON).
   */
  stlData: string // base64

  /**
   * Printer profile (nozzle dia, bed size, max temp, etc.).
   */
  printer: PrinterProfile

  /**
   * Filament profile (viscosity, printing temp, etc.).
   */
  filament: FilamentProfile

  /**
   * Print settings (layer height, speed, infill %, etc.).
   */
  settings: PrintSettings
}

/**
 * Output from engine plugin: G-code line-by-line.
 */
export interface EngineInvokeResult {
  /**
   * G-code as plain text.
   */
  gcode: string

  /**
   * Metadata: layer count, estimated time, material weight.
   */
  metadata?: {
    layerCount: number
    estimatedTimeSeconds?: number
    filamentWeightGrams?: number
  }
}

/**
 * Progress event streamed during long slicing operations.
 */
export interface EngineProgressEvent {
  /**
   * Timestamp (milliseconds since epoch).
   */
  timestamp: number

  /**
   * Current phase: "parsing" | "slicing" | "gcode-gen" | "done".
   */
  phase: 'parsing' | 'slicing' | 'gcode-gen' | 'done'

  /**
   * Progress within phase (0–100, or -1 if indeterminate).
   */
  progress: number

  /**
   * Human-readable status message.
   */
  message?: string

  /**
   * Estimated remaining time (seconds), if available.
   */
  estimatedSecondsRemaining?: number
}

/**
 * Engine plugin declares this interface in manifest.
 */
export const ENGINE_INTERFACE_VERSION = '1.0.0'
