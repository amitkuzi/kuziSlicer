# PRD v2: kuziSlicer as an Extensible Slicer Platform

Status: Draft — **supersedes** [PRD-3d-slicer-unified.md](PRD-3d-slicer-unified.md)
Author: kuziSlicer project (Claude Code session, extending prior Researcher-agent PRD)
Date: 2026-09-06
Supersedes: PRD-3d-slicer-unified.md (2026-09-02) — that document's slicing-engine
feature synthesis (§2–§13 there) is still valid *content* and is preserved below
under §4 as the concrete example filling the "Slicing Engine" extension category.
What changes here is the **product framing**: this is no longer "a slicer with some
plugin support," it's a **minimal core platform** where slicing engines, printer
support, viewer tools, and everything else are extensions — including the ones we
ship ourselves.

## 1. Why this change

Three things converged to force this reframe:

1. **We already built real extension infrastructure twice, independently**, and
   both turned out to be legitimate: `kuziSlicer.PluginHost` (.NET, subprocess-
   isolated, built for GPL-licensed engine code) and `kuziSlicer.extensions`
   (TypeScript, in-process, built for printer connectivity — LAN discovery/
   upload/print — which needs plain Node sockets and has no GPL concerns). A
   parallel work session then pushed a *third* implementation of the same
   `arcane-engine` slicing plugin directly into the TS side. Rather than pick a
   winner, the right fix is to recognize these are two valid **runtimes** for
   the same plugin *type*, and design for both from the start.
2. **The 3D viewport has zero editing tools today** (confirmed: `ModelViewer.tsx`
   has camera orbit + a wireframe toggle, nothing else) — no move/rotate/scale,
   no cut, no measure, none of the toolbar tools every mainstream slicer
   (PrusaSlicer, OrcaSlicer, BambuStudio, ElegooSlicer) ships. This is a real,
   wide-open gap, not a retrofit — the right moment to design it as an
   extension category from day one instead of hard-coding it into the core app
   and having to retrofit an extension point later.
3. **The explicit ask**: build kuziSlicer as a platform other people can extend
   *without forking or modifying core code* — printer vendors ship their own
   connectivity+profile plugin, tool authors ship their own viewport tool,
   engine authors ship their own slicing engine (GPL or not, their choice of
   isolation) — all installable side-by-side, none of them touching
   `src/main` or `src/renderer` core code.

## 2. Vision

kuziSlicer's core ships as small as possible: a 3D viewport, a plugin/extension
host, a settings model, and enough UI chrome (toolbar, side panels, menus) to be
a **contribution surface**, not a fixed feature set. Everything a user actually
interacts with — printer profiles, printer connectivity, the slicing engine
itself, every viewport tool, every import/export format, every G-code
post-processing step — is an extension registered through one manifest-based
contribution system. The company (or anyone else) ships a default "starter pack"
of extensions so the app is useful out of the box, but nothing in that starter
pack has special privileges over a third-party extension — same manifest shape,
same contribution points, same install mechanism.

This is the same shape as VS Code (editor core + extensions for every language/
tool), Blender (core + add-ons for every modeling/render feature), or OctoPrint
(core + plugins for every printer integration) — applied to slicing.

## 3. Extension Taxonomy

Every extension declares one or more **contributions** in its manifest. A single
extension package may contribute to multiple points (e.g., one Elegoo-branded
extension ships both a printer profile *and* its connectivity implementation).

| Contribution point | What it adds | Concrete example | Runtime (see §5) |
|---|---|---|---|
| `printer.profile` | Printer hardware definition (bed size, kinematics, nozzle diameters, temp limits, start/end g-code) | "Elegoo Centauri Carbon" profile family (0.2/0.4/0.6/0.8mm) — **already built** | data-only |
| `filament.profile` | Material definition (temps, flow ratio, cooling curve, cost/density) | "Generic PETG", "Elegoo Rapid PLA+" | data-only |
| `printer.connection` | LAN/cloud communication: discover, upload, print, pause/resume/cancel, status, camera | Elegoo Centauri Carbon SDCP client — **already built and verified on real hardware** (see [[printer_extension_plugin_type]]) | in-process-node |
| `engine.slicer` | Mesh + settings → G-code | Arachne perimeters/infill/supports/wipe-tower | subprocess **or** in-process (author's choice) |
| `viewport.tool` | A toolbar tool with live 3D scene interaction | Move, Rotate, Scale, Place-on-face, Cut/Split, Mirror, Measure, paint-on-supports, paint-on-seam, paint-on-color (MMU), paint-on-fuzzy-skin, Text/Emboss, Simplify mesh, Variable layer height, Arrange, Auto-orient, Add-modifier-mesh (support blocker/enforcer, negative volume) | in-process-renderer |
| `format.importer` / `format.exporter` | File format handling | STL, 3MF, STEP, OBJ import; profile import/export (already exists in a narrower form) | in-process-node |
| `gcode.postProcessor` | Text-transform hook run on the sliced G-code before export/send | Custom start/end sequence injection, per-layer color-change scripts | in-process-node |
| `ui.panel` | A new sidebar/dashboard panel or widget | Filament cost calculator, print-farm status dashboard | in-process-renderer |
| `automation.listener` | Subscribes to app lifecycle events, no UI | Print-complete → Discord/Slack webhook | in-process-node |
| `wizard.step` *(P2)* | A step in a guided flow (calibration, first-run setup) | Temp tower, flow-rate, pressure-advance calibration wizards | composite (engine + renderer) |
| `ui.theme` *(P2)* | Color palette / CSS token overrides | Dark-mode variant, brand reskin | data-only |

This table is deliberately open-ended: a new contribution point can be added to
the host (§ HLD) without touching any existing extension's code, and an
extension can declare a contribution point the host doesn't recognize yet
(ignored, not an error) — forward-compatible by design.

## 4. Slicing Engine Feature Set (inherited from PRD v1)

The original PRD's slicing-engine research (Arachne perimeters, shared infill
library + sandwich mode, dual organic/grid supports, calibration wizard suite,
three-tier settings hierarchy, connectivity abstraction, multi-plate workspace,
PBR viewport) is **still the correct feature target** — it just now ships as the
concrete `engine.slicer` + `wizard.step` + `viewport.tool` extensions that fill
the taxonomy above, rather than as hard-coded core features. See the original
document's §2–§13 for the full synthesis rationale (Arachne, infill, supports,
multi-material/AMS, calibration, cooling, settings architecture, workspace,
viewport, UI philosophy) — none of that reasoning changes, only *where the code
lives* changes.

**One explicit change from PRD v1 §9/§16**: Klipper/Moonraker is **deprioritized
to P2**, not P0 — there is no Klipper/Moonraker printer available to test
against. P0's `printer.connection` reference implementations are Bambu Lab
(FTPS+MQTT) and Elegoo Centauri Carbon (SDCP v3), both already built and (Elegoo)
verified against real hardware. Klipper/Moonraker remains a fully valid future
`printer.connection` extension — nothing about the contribution-point design
privileges the two P0 protocols over it.

## 5. Runtime Model

Three runtimes, chosen per-extension by its manifest, not by contribution type:

- **data-only**: JSON/YAML, no code, loaded and validated by the host directly.
- **in-process-node**: runs in the Electron main process alongside the app's
  own Node code — fast, simple, no IPC overhead, but no isolation (a crash
  takes the app down; a GPL license here is a real legal question — flag it,
  don't ignore it).
- **subprocess-host**: runs as an isolated OS process (today: `kuziSlicer.
  PluginHost`, .NET) communicating over REST/SSE/SignalR — required for GPL-
  licensed engine code (linking argument, see original HLD §1.1), untrusted
  third-party code, or CPU-heavy work that shouldn't block the main process.
- **in-process-renderer** *(new, needed for `viewport.tool`/`ui.panel`)*: runs
  inside the renderer process with access to the live Three.js scene/camera —
  neither of the two existing runtimes can do this (main-process code has no
  DOM/WebGL access; the current renderer has no extension-loading mechanism at
  all). This is genuinely new work, not a relabeling of something that exists.

An extension's manifest declares its runtime; the host doesn't infer it from
the contribution type. This is what lets `arcane-engine` legitimately exist as
both an in-process-node TS version and a subprocess .NET version — they're
different extensions serving different needs (fast local dev vs. GPL isolation
for distribution), not a bug to resolve.

## 6. Non-Goals

- **Not** building a general-purpose sandboxed plugin marketplace/store at P0 —
  extensions are installed by placing them in a known directory (bundled or
  user `plugins/` folder), same as today. A discoverable marketplace is a P2+
  concern (ties into PRD v1 §8's "central repository" open question, still
  open).
- **Not** rewriting the two existing runtimes from scratch — `kuziSlicer.
  PluginHost` and `kuziSlicer.extensions` both stay; the work is unifying them
  behind one manager and adding the missing renderer runtime, not replacing
  either.
- **Not** attempting arbitrary third-party code execution with full security
  sandboxing (no V8 isolates, no WASM sandboxing) at P0 — `in-process-node` and
  `in-process-renderer` extensions run with the same trust level as the app
  itself. This matches VS Code's own extension trust model at a comparable
  maturity stage, not a lower bar.
- **Not** solving licensing questions for every possible extension automatically
  — the platform provides the isolation *mechanism* (subprocess-host) that
  makes a GPL choice safe; it does not make licensing decisions for extension
  authors.
- SLA/resin, belt printers, cloud-hosted slicing service: unchanged from PRD
  v1 §13/§14 — still out of scope.

## 7. Phased Priority

**P0 — Platform core + starter extensions**
- Unified extension manager (one manifest schema, one registry, dispatch to
  the three runtimes above).
- Renderer extension host (new) — the mechanism that lets `viewport.tool`/
  `ui.panel` extensions exist at all.
- Contribution points: `printer.profile`, `filament.profile`,
  `printer.connection`, `engine.slicer`, `viewport.tool` (minimum: Move,
  Rotate, Scale, Cut/Split, Measure — enough to not be a toy viewer),
  `format.importer`/`format.exporter`.
- Starter extensions: Bambu Lab + Elegoo Centauri Carbon connectivity
  (already built), Arachne engine (either runtime, pending §0-equivalent
  per-extension licensing choice), STL/3MF import (already exists, migrate
  into the new contribution model).
- Migration of existing `plugin-manifest.ts`/`plugin-engine.ts`/
  `printer-extension-contract.ts` into the unified manifest schema (see HLD).

**P1 — Breadth**
- `gcode.postProcessor`, `ui.panel`, `automation.listener` contribution points.
- Remaining viewport tools (Place-on-face, Mirror, paint-on-supports/seam/
  color, Text/Emboss, Simplify, Variable layer height, Arrange, Auto-orient,
  modifier meshes).
- Calibration wizard suite as `wizard.step` extensions.
- Klipper/Moonraker `printer.connection` extension (moved here from P0 per §4).

**P2 — Platform maturity**
- `wizard.step`, `ui.theme` contribution points.
- Extension marketplace/discovery (central repository).
- STEP import, CSG mesh booleans, interlocking joints (from PRD v1 §2).
- SLA/resin evaluation (separate go/no-go, unchanged from PRD v1).

## 8. Open Questions

1. **Extension permission model at P0**: today's `permissions?: Array<'file-
   read'|'file-write'|'network'|'cpu'>` (from `plugin-manifest.ts`) is
   declarative but not enforced for `in-process-node`/`in-process-renderer`
   runtimes (only `subprocess-host` gets real OS-level isolation). Ship as
   documentation-only for P0, or invest in enforcement (e.g., a restricted
   `require`/`fetch` shim for in-process extensions) before opening the
   platform to third parties?
2. **Renderer extension host security**: `viewport.tool`/`ui.panel` extensions
   need DOM/WebGL access — do we load them as plain ES modules in the same
   renderer context (simplest, no isolation) or via `<iframe sandbox>` +
   postMessage (safer, matches Figma/Miro plugin models, more engineering)?
   Recommend plain ES modules for P0 (matches the in-process-node trust model
   already accepted above), revisit before any third-party marketplace.
3. **Backward compatibility**: does the existing `elegoo-centauri-carbon`
   plugin's manifest need to change shape to fit the new unified schema, or
   does the host accept the current `PrinterExtensionManifest` shape as one
   valid "flavor" indefinitely? Recommend the latter (see HLD §3) to avoid
   redoing verified, working code for a naming exercise.
