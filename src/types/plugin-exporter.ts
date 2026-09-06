/**
 * SPDX-License-Identifier: GPL-3.0-or-later
 * Exporter Plugin Interface — convert a kuziSlicer profile to an external format.
 */

import type { FilamentProfile, PrinterProfile } from './ipc'

export interface ExporterInvokeRequest {
  filename: string
  targetType: 'printer' | 'filament'
  printer?: PrinterProfile
  filament?: FilamentProfile
  options?: Record<string, unknown>
}

export interface ExporterInvokeResult {
  filename: string
  /** Exported file content, base64 encoded. */
  data: string
  mediaType: string
  metadata?: Record<string, unknown>
}

export const EXPORTER_INTERFACE_VERSION = '1.0.0'
