/**
 * Viewport tool registry.
 *
 * Same contribution shape as the infill library: a tool is a self-contained entry,
 * and the 3D viewer's toolbar renders whatever is registered. This is the surface a
 * `viewport.tool` extension will register through once the extension registry lands.
 */

export type GizmoMode = 'translate' | 'rotate' | 'scale'

export interface ViewportTool {
  id: string
  name: string
  /** Single glyph shown in the toolbar. */
  icon: string
  /** Which transform gizmo the tool activates. */
  mode: GizmoMode
  /** Keyboard shortcut, matched against KeyboardEvent.key (case-insensitive). */
  shortcut: string
  hint: string
}

export const VIEWPORT_TOOLS: ViewportTool[] = [
  {
    id: 'move',
    name: 'Move',
    icon: '✥',
    mode: 'translate',
    shortcut: 'm',
    hint: 'Drag the arrows to move the model on the plate.',
  },
  {
    id: 'rotate',
    name: 'Rotate',
    icon: '⟲',
    mode: 'rotate',
    shortcut: 'r',
    hint: 'Drag a ring to rotate. Use this to lay a face flat on the plate.',
  },
  {
    id: 'scale',
    name: 'Scale',
    icon: '⤢',
    mode: 'scale',
    shortcut: 's',
    hint: 'Drag a handle to resize. Drag the centre box to scale uniformly.',
  },
]

/** The transform the slicer needs in order to print what the viewport shows. */
export interface ModelTransform {
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
}

export const IDENTITY_TRANSFORM: ModelTransform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
}

export const isIdentity = (t: ModelTransform): boolean =>
  t.position.every((v) => Math.abs(v) < 1e-6) &&
  t.rotation.every((v) => Math.abs(v) < 1e-6) &&
  t.scale.every((v) => Math.abs(v - 1) < 1e-6)
