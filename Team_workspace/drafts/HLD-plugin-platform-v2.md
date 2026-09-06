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
  /** Present only on store-repo-approved extensions -- see §7. Absent/invalid
   *  signature = "unapproved", triggers the liability-disclaimer flow, never
   *  a load failure. */
  signature?: string
}

/** Which top-level UI mode(s) a UI-facing contribution appears in (§8).
 *  Omit entirely for contributions with no mode-specific meaning
 *  (printer.profile, engine.slicer, printer.connection, etc. show up in
 *  both modes' underlying data/logic regardless). */
type UiMode = 'simple' | 'advanced' | 'both'

type ContributionDeclaration =
  | { point: 'printer.profile'; data: PrinterProfile[] }
  | { point: 'filament.profile'; data: FilamentProfile[] }
  | { point: 'printer.connection'; export: string }        // export name implementing PrinterExtensionPlugin-shaped contract
  | { point: 'engine.slicer'; export: string }              // implements EngineInvokeRequest/Result contract
  | { point: 'viewport.tool'; export: string; icon: string; label: string; mode?: UiMode }
  | { point: 'format.importer' | 'format.exporter'; export: string; extensions: string[] }
  | { point: 'gcode.postProcessor'; export: string }
  | { point: 'ui.panel'; export: string; placement: 'sidebar' | 'bottom'; mode?: UiMode }
  | { point: 'automation.listener'; export: string; events: string[] }
  | { point: 'content.repository'; export: string; sourceName: string }  // implements search()/fetchModel() contract, e.g. MakerWorld/Printables/NexPrint
  | { point: 'wizard.step'; export: string; wizardId: string; order: number }  // wizardId groups steps into one flow, e.g. "simple-new-print"
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
| 7 | Add `signature` field + verification to `extensionRegistry.ts` (§7) — sign the P0 starter extensions as the first "approved" set; everything else defaults to the unapproved-warning path | Low — additive, defaults to today's implicit-trust behavior for anything unsigned |
| 8 | Build `AppShell.tsx`'s mode toggle + `SimpleModeShell.tsx` (§8), starting with a minimal "simple-new-print" `wizard.step` sequence (pick model → pick printer/filament → slice → send) | Medium — new UI surface, but Advanced mode (existing `MainWindow.tsx`) stays the default and is untouched |

Each step is independently shippable and testable — no phase requires the next
one to exist first, matching this repo's existing "buildable increment" norm
(see prior HLD's Phase 0 structure).

## 7. Trust Model Implementation (per PRD §9)

Two-tier, signature-based, **not** per-permission enforcement:

- **Signing**: an approved extension's manifest (minus the `signature` field
  itself) is hashed and signed with a private key held only by whoever
  maintains the store repo (today: the product owner). The public key ships
  bundled with the app (`src/main/services/extensionRegistry.ts` or a small
  co-located constant/asset). At load time, the registry:
  1. Computes the hash of the manifest (excluding `signature`).
  2. Verifies `signature` against the bundled public key.
  3. Marks the extension `approved: true` on success, `approved: false` on a
     missing/invalid signature — **never** refuses to load either way.
- **Unapproved-extension warning**: when the user tries to *enable* (not just
  load — loading/listing is fine) an extension with `approved: false`, the UI
  shows a blocking confirmation dialog with the liability-disclaimer text
  (§9 in the PRD) before the enable takes effect. This is a one-time gate per
  extension (like the existing `plugins.json` enabled-state persistence in
  `pluginManager.ts` — reuse that pattern, add an `acknowledgedRisk: boolean`
  field alongside `enabled`).
- **No technical sandbox difference between tiers** — this is explicitly a
  legal/UX gate (§9 in the PRD), not a security boundary. An unapproved
  `in-process-node`/`in-process-renderer` extension has identical code access
  to an approved one once the user clicks through the warning. Only
  `subprocess-host` provides real isolation, independent of signing status.
- `permissions` array stays fully declarative (documentation shown in the
  warning dialog / extension info panel), never enforced — this closes PRD
  §8's old open question 1 without building the `require`/`fetch` shim that
  question raised; the shim is now explicitly out of scope unless a future
  public marketplace with untrusted authors demands real sandboxing (P2+).
- `subprocess-host` remains the only real isolation boundary — anything
  needing genuine fault/license isolation (GPL code, untrusted binaries)
  should use it regardless of signing status. The registry should surface a
  warning (not a hard block) when a manifest declares a GPL-family `license`
  with a non-`subprocess-host` `runtime` — the arcane-engine TS version
  currently does this and needs a product decision, not a silent crash.

## 8. UI Mode Composition (per PRD §10)

Simple/Advanced mode is a **shell-level rendering decision**, not a different
extension set or a different app build:

```
src/renderer/
  ├── AppShell.tsx          // reads uiMode from settings ('simple'|'advanced'),
  │                          //   passes it down; toggled from a persistent
  │                          //   header control, persisted like today's
  │                          //   settings:get/settings:set (ConfigWizard's
  │                          //   pattern)
  ├── SimpleModeShell.tsx    // (new) renders the wizard.step sequence for
  │                          //   wizardId "simple-new-print", ordered by
  │                          //   each contribution's `order` field
  └── MainWindow.tsx         // (existing) Advanced mode -- unchanged, plus
                              //   filters ToolbarSlot/panel registrations by
                              //   `mode: 'advanced'|'both'`
```

- The extension registry doesn't know or care about UI mode — it indexes
  every contribution regardless of `mode`. Filtering by mode happens purely
  in the renderer shell when deciding what to render, per PRD §10's "switching
  modes doesn't reload extensions."
- `wizard.step` contributions for the same `wizardId` are sorted by `order`
  and rendered as a linear step sequence by `SimpleModeShell`; a `content.
  repository` extension used as a Simple-mode step is just a `viewport.tool`-
  shaped or `ui.panel`-shaped renderer that also happens to be invoked from
  inside a wizard step, not a different runtime.
- P0 has no Simple mode yet (per PRD §7, it's P1) — this section documents
  the target shape so P0's `ExtensionHostProvider`/`ToolbarSlot` (§5) are
  built with the `mode` filter in mind from the start, rather than needing a
  rework when Simple mode arrives.

## 9. What this HLD deliberately does not redesign

- The subprocess protocol (REST/SSE/SignalR) between Electron and
  `kuziSlicer.PluginHost` — unchanged, works, tested.
- The SDCP/Bambu wire protocols themselves — unchanged, verified working.
- The existing three-tier settings override model (`overrideEngine.ts`) —
  orthogonal to extensions, not touched.
- Any UI visual design beyond "there is now a toolbar slot for tools" and "two
  top-level modes" — icon design, exact toolbar layout, wizard step visual
  design, and panel visual design are implementation details for whoever
  builds the first `viewport.tool`/`wizard.step` extensions, not architecture.
- The store repo's actual hosting/distribution mechanism (GitHub releases?
  a dedicated service?) and the signing tool/CI step that produces
  `signature` values — both still open, tie into PRD v1 §8's original
  "artifact storage" question.
