/**
 * Importer Plugin Interface — convert external profile format → kuziSlicer profile.
 * Plugins of type "importer" conform to this contract.
 */

import type { PrinterProfile, FilamentProfile } from './ipc'

/**
 * Raw file data passed to importer plugin.
 */
export interface ImporterInvokeRequest {
  /**
   * File name (for format detection).
   */
  filename: string

  /**
   * File content (base64-encoded binary or UTF-8 text).
   */
  data: string // base64

  /**
   * Import target type: "printer" or "filament".
   */
  targetType: 'printer' | 'filament'
}

/**
 * Result of import: parsed profile.
 */
export interface ImporterInvokeResult {
  /**
   * Imported printer profile (if targetType was "printer").
   */
  printer?: PrinterProfile

  /**
   * Imported filament profile (if targetType was "filament").
   */
  filament?: FilamentProfile

  /**
   * Metadata from source file (name, version, source URL, etc.).
   */
  metadata?: {
    sourceName?: string
    sourceVersion?: string
    sourceUrl?: string
    [key: string]: unknown
  }
}

/**
 * Importer plugin declares this interface version in manifest.
 */
export const IMPORTER_INTERFACE_VERSION = '1.0.0'
