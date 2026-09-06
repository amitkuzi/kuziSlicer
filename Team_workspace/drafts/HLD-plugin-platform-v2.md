# HLD v2: kuziSlicer Extension Platform

**Status:** Draft — **supersedes** [HLD-3d-slicer-P0.md](HLD-3d-slicer-P0.md)
**Source:** [PRD-plugin-platform-v2.md](PRD-plugin-platform-v2.md)
**Date:** 2026-09-06
**Scope:** Unifies the two existing, independently-built extension systems
(`kuziSlicer.PluginHost` subprocess runtime, `kuziSlicer.extensions` in-process
runtime) behind one manager, adds the missing third runtime (renderer,
required for viewport tools), and defines a generalized contribution-point
manifest that both existing plugin shapes (`PluginManifest`,
`PrinterExtensionManifest`) fit into **without being rewritten**.

## 0. What already exists (don't rebuild this)

| Piece | Location | Status |
|---|---|---|
| Subprocess plugin host (.NET) | `src/plugins/PluginHost` | Built, tested (`dotnet build`/`test` green) |
| Subprocess client (Electron main) | `src/main/clients/pluginHostClient.ts`, `src/main/services/pluginManager.ts` | Built |
| Engine/importer/exporter/tool manifest schema | `src/types/plugin-manifest.ts`, `plugin-engine.ts`, `plugin-importer.ts`, `plugin-tool.ts` | Built |
| In-process TS extension repo | `src/plugins/extensions` (submodule) | Built, has real extensions (`arcane-engine`, `overhang-detector`, `profile-importer`, `elegoo-centauri-carbon`) |
| Printer-connectivity contract | `src/plugins/extensions/plugins/_template-printer-extension/src/printer-extension-contract.ts` | Built, verified against real hardware |
| Printer-connectivity test bench | `src/plugins/extensions/testbench/` | Built, 3-tier (manifest/mock/live) |
| Renderer 3D viewport | `src/renderer/components/Tabs/ModelViewer.tsx` | Exists — camera orbit + wireframe toggle only, **zero tool/extension hooks** |

Nothing here gets thrown away. §1–§4 below describe the thin unifying layer on
top; §5 describes the one genuinely new piece (renderer extension host).

## 1. Architecture Overview

```
                    ┌─────────────────────────────────────────┐
                    │         Extension Manifest (v2)          │
                    │  { id, version, contributes: [...] }     │
                    └──────────────────┬────────────────────────┘
                                       │ loaded by
                                       ▼
                    ┌─────────────────────────────────────────┐
                    │        Extension Registry (main proc)     │
                    │  src/main/services/extensionRegistry.ts   │
                    │  - scans bundled + user extension dirs    │
                    │  - validates manifests (v2 schema)         │
                    │  - indexes contributions by point          │
                    │  - dispatches invoke() by runtime            │
                    └───┬──────────┬──────────┬──────────────────┘
                        │          │          │
             runtime:   │          │          │
          data-only     │  in-process-node    │  subprocess-host
                        │          │          │
                        ▼          ▼          ▼
              (validated,   direct import   pluginHostClient.ts
               no code to    (existing        (existing, .NET
               execute)    pluginManager.ts   PluginHost, REST/
                            pattern)          SSE/SignalR)
                                       │
                        runtime: in-process-renderer
                                       │
                                       ▼
                          IPC bridge → Renderer Extension Host
                          (NEW — src/renderer/extensionHost/)
                          loads ES module bundles into the live
                          Three.js scene/React tree
```

The registry is the only new *required* main-process piece — everything below
it (in-process-node dispatch, subprocess-host dispatch) is the existing
`pluginManager.ts`/`pluginHostClient.ts` code, called from one place instead of
ad hoc per-feature IPC handlers (compare today's `printer:elegoo-print`
handler in `main.ts`, which directly imports one specific extension — the
registry generalizes that pattern without changing what it does).

## 2. Manifest Schema v2

```typescript
// src/types/extension-manifest.ts (new, generalizes plugin-manifest.ts)

interface ExtensionManifest {
  id: string                    // kebab-case, unique
  version: string                // semver
  title: string
  vendor: string
  license: string
  runtime: 'data-only' | 'in-process-node' | 'in-process-renderer' | 'subprocess-host'
  entrypoint?: string             // required for all runtimes except data-only
  permissions?: Array<'file-read' | 'file-write' | 'network' | 'cpu'>
  contributes: ContributionDeclaration[]
  minVersion?: string
  maxVersion?: string
}

type ContributionDeclaration =
  | { point: 'printer.profile'; data: PrinterProfile[] }
  | { point: 'filament.profile'; data: FilamentProfile[] }
  | { point: 'printer.connection'; export: string }        // export name implementing PrinterExtensionPlugin-shaped contract
  | { point: 'engine.slicer'; export: string }              // implements EngineInvokeRequest/Result contract
  | { point: 'viewport.tool'; export: string; icon: string; label: string }
  | { point: 'format.importer' | 'format.exporter'; export: string; extensions: string[] }
  | { point: 'gcode.postProcessor'; export: string }
  | { point: 'ui.panel'; export: string; placement: 'sidebar' | 'bottom' }
  | { point: 'automation.listener'; export: string; events: string[] }
  // 'wizard.step' and 'ui.theme' contribution shapes: designed in P2, not
  // frozen here — adding a new union member later doesn't break existing
  // manifests (see §3, forward-compatibility).
```

**This is additive, not a rewrite.** A `PrinterExtensionManifest` (today's
`elegoo-centauri-carbon/manifest.json` shape) is accepted as-is by treating
`type: 'rapid-printer-extension'` + its `capabilities` array as sugar for
`contributes: [{ point: 'printer.connection', export: 'default' }]` at load
time — a translation shim in the registry, not a rewrite of the plugin. Same
for the existing `PluginManifest` (`type: 'engine'|'importer'|'exporter'|
'tool'`) → `contributes: [{ point: 'engine.slicer' | 'format.importer' | ... }]`.
**No existing plugin's code changes.** Only new extensions need to author the
v2 shape directly; old ones keep working through the shim indefinitely (see
PRD §8, open question 3 — this HLD's answer is "yes, keep the shim").

## 3. Forward-Compatibility Rule

The registry **ignores, not errors on**, any `contributes` entry whose `point`
it doesn't recognize (logs a debug-level notice, nothing user-facing). This is
what makes "add a contribution point later without touching existing
extensions" actually true — an extension written today that (hypothetically)
also declares a `wizard.step` contribution before that point exists will load
fine, with just that one contribution silently unregistered until the host
catches up.

## 4. Runtime Dispatch Detail

- **data-only**: registry validates against the relevant schema (e.g.
  `PrinterProfile`), merges into the in-memory catalog exactly like
  `printers.json` is merged today (`ProfilesManager`) — no new mechanism,
  just sourced from extension manifests in addition to the bundled JSON file.
- **in-process-node**: `import()` the extension's compiled entrypoint (or, per
  the existing testbench pattern, esbuild-bundle its TS source directly — both
  already proven to work in this codebase) and call the named export. Same
  trust model as today's `elegoo-centauri-carbon` wiring into `main.ts`.
- **subprocess-host**: unchanged — routes through `pluginHostClient.ts` to
  `kuziSlicer.PluginHost`. This is the *only* runtime with real OS-level fault/
  license isolation; anything requiring that isolation (GPL engine code,
  untrusted third-party binaries) must declare this runtime.
- **in-process-renderer**: see §5 — genuinely new.

## 5. Renderer Extension Host (new)

The one piece with no existing analog. Needed because `viewport.tool` and
`ui.panel` contributions must run inside the renderer process with access to
the live Three.js `scene`/`camera`/`renderer` objects that `ModelViewer.tsx`
owns — main-process code has no DOM/WebGL access, and nothing in the current
renderer loads external code at all.

**Design** (P0, matching PRD §8's recommendation — plain ES modules, no
iframe sandbox yet):

```
src/renderer/extensionHost/
  ├── ExtensionHostProvider.tsx   // React context: exposes { scene, camera,
  │                                //   renderer, selectedObjects, registerTool(),
  │                                //   registerPanel() } to loaded extensions
  ├── loadExtension.ts            // dynamic import() of a viewport.tool's
  │                                //   compiled bundle; extension calls
  │                                //   context.registerTool({icon, label, onActivate, onDeactivate})
  └── ToolbarSlot.tsx             // renders one button per registered tool,
                                   //   dispatches activate/deactivate + pointer
                                   //   events into the active tool's handlers
```

- **`ModelViewer.tsx` changes**: wrap its Three.js scene/camera refs in
  `ExtensionHostProvider`, render `<ToolbarSlot />` where the current static
  wireframe-toggle button lives (§1's "Toolbar" comment at line 259 is
  already the right spot).
- **Extension-side contract** (mirrors the `PrinterExtensionPlugin` pattern —
  vendored contract file, no shared package):
  ```typescript
  interface ViewportTool {
    id: string
    icon: string   // asset path or icon name
    label: string
    onActivate(ctx: ExtensionHostContext): void
    onDeactivate(ctx: ExtensionHostContext): void
    onPointerDown?(ctx: ExtensionHostContext, event: PointerEvent): void
    // ... onPointerMove/Up as needed per tool
  }
  ```
- **Bundling**: extension TS source is esbuild-bundled to browser-target
  (`platform: 'browser'`, not `'node'` — different from the main-process
  esbuild config used for `in-process-node` extensions) and loaded via
  `import()` from a `blob:` or `file://` URL, or pre-bundled at build time
  into `dist/extensions/` — exact mechanism is an implementation detail to
  settle during Phase 0 of the migration (§6), not a blocker to designing the
  contract now.
- **First tools to build** (P0, per PRD §7): Move, Rotate, Scale (the three
  universal transform gizmos — Three.js ships `TransformControls` for exactly
  this, use it rather than hand-rolling gizmo math), Cut/Split (plane-cut,
  needs CSG — flag as the one tool with real geometry-math complexity), Measure
  (raycasting + distance display, comparatively simple).

## 6. Migration Plan (no big-bang rewrite)

| Step | Change | Risk |
|---|---|---|
| 1 | Add `src/types/extension-manifest.ts` (v2 schema, §2) — pure addition, nothing depends on it yet | None |
| 2 | Build `extensionRegistry.ts` with the v1-shape translation shims (§2) — point it at existing `src/plugins/extensions/plugins/*` and `src/plugins/PluginHost/plugins/*`, confirm it indexes today's real extensions (elegoo-centauri-carbon, arcane-engine ×2, overhang-detector, profile-importer) correctly without touching any of their code | Low — read-only scanning + shimming, no behavior change yet |
| 3 | Migrate `main.ts`'s `printer:elegoo-print`/`printer:elegoo-snapshot` handlers to go through the registry instead of the direct import added this session — same runtime call underneath, now routed generically | Low — same function calls, different call site |
| 4 | Build the renderer extension host (§5) + `TransformControls`-based Move/Rotate/Scale as the first real `viewport.tool` extensions | Medium — new subsystem, but additive to `ModelViewer.tsx` (existing orbit controls/wireframe untouched) |
| 5 | Migrate `printers.json`'s static catalog into `printer.profile` contributions from extension manifests (Elegoo entries become the first real example) — bundled JSON stays as the *fallback* data-only extension, not deleted | Low |
| 6 | Decide the `arcane-engine` duplication per PRD §7 (P0 starter extension) — both runtimes stay available under the registry; pick which one (or both) ships as "starter," which stays as reference/example | Needs product decision, not just code |

Each step is independently shippable and testable — no phase requires the next
one to exist first, matching this repo's existing "buildable increment" norm
(see prior HLD's Phase 0 structure).

## 7. Security Notes (carried from PRD §8)

- `in-process-node`/`in-process-renderer` extensions run with full trust —
  same as the app's own code. This is acceptable for P0 (bundled + user-
  installed-by-hand extensions, no marketplace), matches VS Code's own
  extension trust model at a comparable stage.
- `subprocess-host` remains the only real isolation boundary — anything
  needing genuine fault/license isolation (GPL code, untrusted binaries) must
  use it. The registry should refuse to load a manifest that declares GPL-
  family `license` with a non-`subprocess-host` `runtime` and surface a clear
  warning (not a hard block — the arcane-engine TS version currently violates
  this and needs a product decision, not a silent crash).
- `permissions` array stays declarative-only at P0 (documentation, not
  enforcement) for `in-process-*` runtimes — real enforcement (restricted
  `require`/`fetch` shims) is a P1+ investment, per PRD §8 open question 1.

## 8. What this HLD deliberately does not redesign

- The subprocess protocol (REST/SSE/SignalR) between Electron and
  `kuziSlicer.PluginHost` — unchanged, works, tested.
- The SDCP/Bambu wire protocols themselves — unchanged, verified working.
- The existing three-tier settings override model (`overrideEngine.ts`) —
  orthogonal to extensions, not touched.
- Any UI visual design beyond "there is now a toolbar slot for tools" — icon
  design, exact toolbar layout, and panel visual design are implementation
  details for whoever builds the first `viewport.tool` extensions, not
  architecture.
