/**
 * Tool Plugin Interface — generic utilities (overhang detection, mesh repair, etc.).
 * Plugins of type "tool" conform to this contract (flexible input/output).
 */

/**
 * Generic tool invocation — shape depends on tool type.
 * PluginHost passes this as opaque JSON; plugin interprets per its purpose.
 */
export interface ToolInvokeRequest {
  /**
   * Tool name (e.g., "overhang-detector", "mesh-repair", "wall-thickness-analyzer").
   * Used for routing to correct plugin subcommand if bundled.
   */
  toolName: string

  /**
   * Input data (base64 binary, e.g., STL) or nested object.
   */
  data: string | Record<string, unknown>

  /**
   * Optional parameters (tool-specific).
   */
  options?: Record<string, unknown>
}

/**
 * Tool result — shape depends on tool type.
 */
export interface ToolInvokeResult {
  /**
   * Output data (base64 binary or nested object, depends on tool).
   */
  result?: string | Record<string, unknown>

  /**
   * Messages (warnings, info) to display to user.
   */
  messages?: Array<{ level: 'info' | 'warning' | 'error'; text: string }>

  /**
   * Metadata (execution time, version, etc.).
   */
  metadata?: {
    executionTimeMs?: number
    toolVersion?: string
    [key: string]: unknown
  }
}

/**
 * For tools that stream results (e.g., progressive mesh repair).
 */
export interface ToolProgressEvent {
  timestamp: number
  phase: string // tool-specific
  progress: number // 0–100
  message?: string
}

/**
 * Tool plugin declares this interface version in manifest.
 */
export const TOOL_INTERFACE_VERSION = '1.0.0'
