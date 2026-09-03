/**
 * Override Engine — resolves the three-layer settings hierarchy.
 * Priority: per-part > per-object > global. Pure function, no I/O.
 */

import type { PrintSettings } from '../gcodeGenerator'

export type PrintSettingsOverride = Partial<PrintSettings>

export interface OverrideLayers {
  global: PrintSettings
  object?: PrintSettingsOverride
  part?: PrintSettingsOverride
}

export function resolveOverrides(layers: OverrideLayers): PrintSettings {
  return {
    ...layers.global,
    ...layers.object,
    ...layers.part,
  }
}
