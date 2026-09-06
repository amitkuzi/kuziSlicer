/**
 * Plugin Manifest — declares metadata, capabilities, and permissions.
 * Every plugin must have a manifest.json at its root, conforming to this shape.
 */

export interface PluginManifest {
  /**
   * Semantic version string (e.g., "1.0.0", "2.3.4-beta.1").
   * Must be parseable by semver; used for compatibility checks.
   */
  version: string

  /**
   * Plugin name (alphanumeric + dash, no spaces).
   * Used as unique identifier alongside version.
   */
  name: string

  /**
   * Human-readable title (arbitrary string, for UI display).
   */
  title: string

  /**
   * One-line description (UI tooltip, max ~100 chars).
   */
  description: string

  /**
   * Author name or org.
   */
  author: string

  /**
   * License identifier (e.g., "Apache-2.0", "GPL-3.0-or-later", "MIT").
   * Parsed for license compatibility checks.
   */
  license: string

  /**
   * Plugin type — determines input/output contract.
   * - "engine": slicing (STL → layer toolpaths → gcode)
   * - "importer": profile import (external format → kuziSlicer profile)
   * - "exporter": profile export (kuziSlicer profile → external format)
   * - "tool": utility (overhang detection, mesh repair, etc.)
   */
  type: 'engine' | 'importer' | 'exporter' | 'tool' | 'rapid printer extension'

  /**
   * Requested sandbox permissions (optional).
   * Used by PluginHost to set OS limits / file access rules.
   * - "file-read": read from userData or temp
   * - "file-write": write to userData or temp
   * - "network": outbound HTTP/TCP
   * - "cpu": multi-threaded compute (default limit: single-core if omitted)
   */
  permissions?: Array<'file-read' | 'file-write' | 'network' | 'cpu'>

  /**
   * Entrypoint — executable name or script path.
   * For native plugins: "MyPlugin.exe" (PluginHost.Core launches it via Process.Start).
   * For script plugins: "main.js" or "main.py" (future; not in P0).
   */
  entrypoint: string

  /**
   * Minimum kuziSlicer version required (semver, optional).
   * If omitted, plugin runs on any version.
   */
  minVersion?: string

  /**
   * Maximum kuziSlicer version supported (semver, optional).
   * If omitted, no upper bound.
   */
  maxVersion?: string
}

/**
 * Validates manifest object against schema.
 * Throws on missing required fields or invalid semver/license.
 */
export function validateManifest(manifest: unknown): manifest is PluginManifest {
  if (!manifest || typeof manifest !== 'object') return false

  const m = manifest as Record<string, unknown>

  // Required fields
  if (typeof m.version !== 'string' || !isSemVer(m.version)) return false
  if (typeof m.name !== 'string' || !/^[a-zA-Z0-9-]+$/.test(m.name)) return false
  if (typeof m.title !== 'string') return false
  if (typeof m.description !== 'string') return false
  if (typeof m.author !== 'string') return false
  if (typeof m.license !== 'string') return false
  if (!['engine', 'importer', 'exporter', 'tool', 'rapid printer extension'].includes(m.type as string)) return false
  if (typeof m.entrypoint !== 'string') return false

  // Optional fields
  if (m.permissions && !Array.isArray(m.permissions)) return false
  if (m.minVersion && (typeof m.minVersion !== 'string' || !isSemVer(m.minVersion))) return false
  if (m.maxVersion && (typeof m.maxVersion !== 'string' || !isSemVer(m.maxVersion))) return false

  return true
}

function isSemVer(s: string): boolean {
  return /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9]+(?:\.[a-zA-Z0-9]+)*)?(?:\+[a-zA-Z0-9]+)?$/.test(s)
}
