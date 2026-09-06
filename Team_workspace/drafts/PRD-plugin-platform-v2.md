# PRD v2: kuziSlicer as an Extensible Slicer Platform

Status: Draft — **supersedes** [PRD-3d-slicer-unified.md](PRD-3d-slicer-unified.md)
Author: kuziSlicer project (Claude Code session, extending prior Researcher-agent PRD)
Date: 2026-09-06
Updated: 2026-09-06 — added extension trust model (§9), UI modes (§10), and
the `content.repository` contribution point (§3), per product-owner decisions.
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
| `content.repository` | Browse/search/download community models from within the app | MakerWorld, Printables, NexPrint | in-process-node |
| `wizard.step` | A step in a guided flow (calibration, first-run setup, Simple-mode onboarding — see §10) | Temp tower/flow-rate/PA calibration; "New Print" guided flow | composite (engine + renderer) |
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

- **Not** building a full browsable-marketplace UI (search, ratings, one-click
  install from a catalog page) at P0 — see §9 for what P0 *does* include (a
  signed-vs-unsigned trust tier), which resolves PRD v1 §8's "central
  repository" open question at the mechanism level without committing to a
  marketplace storefront yet.
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

**P1 — Breadth + the two UI modes**
- `gcode.postProcessor`, `ui.panel`, `automation.listener`, `content.
  repository`, `wizard.step` contribution points.
- **Advanced mode** (§10): filament profile management, model editing via
  viewport tools, slicing, post-slicing processing (e.g. a "true color print"
  `gcode.postProcessor`), print manager — this is the existing slicer UX
  direction, now composed from contribution points instead of hard-coded.
- **Simple mode** (§10): guided "New Print" wizard built from `wizard.step`
  extensions, minimal decisions surfaced, first `content.repository`
  extension (MakerWorld/Printables/NexPrint) for browsing community models
  without leaving the app.
- Remaining viewport tools (Place-on-face, Mirror, paint-on-supports/seam/
  color, Text/Emboss, Simplify, Variable layer height, Arrange, Auto-orient,
  modifier meshes).
- Calibration wizard suite as additional `wizard.step` extensions.
- Klipper/Moonraker `printer.connection` extension (moved here from P0 per §4).
- **Signed-extension trust tier + real sandbox enforcement** (§9) — signing/
  verification mechanism, liability-disclaimer warning UI, **and** the
  subprocess/iframe-sandbox isolation for unsigned extensions (elevated from
  a documentation-only permissions model after security review — see HLD §7).
  This is now a required P1 item, not an optional hardening pass.

**P2 — Platform maturity**
- `ui.theme` contribution point.
- Full marketplace UI (browse/search/install from a catalog) on top of the
  P1 signing mechanism.
- STEP import, CSG mesh booleans, interlocking joints (from PRD v1 §2).
- SLA/resin evaluation (separate go/no-go, unchanged from PRD v1).

## 8. Open Questions

1. ~~Extension permission model at P0~~ — **RESOLVED, revised 2026-09-06**.
   Running untrusted extension code against an app that controls physical
   printer hardware is a real security threat, not just a liability question
   — confirmed by product owner. Real technical protection is **required**,
   not optional: unsigned/unapproved extensions run under enforced isolation
   (subprocess for declared `in-process-node`, iframe-sandbox for declared
   `in-process-renderer`) regardless of what they asked for; only signed/
   approved extensions get the fast direct-execution path. See §9 and HLD §7
   for the mechanism. This moves real enforcement into **P1** (not deferred
   to P2+ as first drafted).
2. ~~Renderer extension host security~~ — **RESOLVED** by the above: signed
   extensions use plain ES modules with full scene access (fast path);
   unsigned extensions are sandboxed via `<iframe sandbox>` + postMessage.
   Not a P0/P1 split by extension type anymore — it's determined by trust
   tier for every extension.
3. **Backward compatibility**: does the existing `elegoo-centauri-carbon`
   plugin's manifest need to change shape to fit the new unified schema, or
   does the host accept the current `PrinterExtensionManifest` shape as one
   valid "flavor" indefinitely? Recommend the latter (see HLD §3) to avoid
   redoing verified, working code for a naming exercise.

## 9. Extension Trust Model

Product-owner decision (2026-09-06): a two-tier trust model, not per-permission
enforcement.

- **Approved extensions**: personally tested by the product owner, then
  published to an official **store repo** (the P1 mechanism referenced in
  §6/§7 — not a full marketplace UI yet, just a signed, known-good
  collection). An approved extension is **signed** and runs with **no read
  restrictions** — full trust, same as core code. This applies uniformly
  across all four runtimes (§5): a signed `in-process-renderer` extension gets
  the same unrestricted DOM/WebGL access a signed `subprocess-host` extension
  gets unrestricted OS-process access.
- **Unapproved extensions** (anything not in the store repo — third-party,
  community, or still under development): load and run, but under **enforced
  isolation** — revised 2026-09-06 after product-owner pushback on the initial
  "warning dialog only" version, which correctly identified that running
  arbitrary unvetted code against an app controlling physical printer
  hardware is a real cyber-security threat, not just a liability question. An
  unapproved extension's declared runtime becomes a *ceiling*, not a
  guarantee: declared `in-process-node` actually executes in an isolated
  subprocess with no direct filesystem/network access beyond what its
  declared `permissions` grants (now **enforced**, not documentation);
  declared `in-process-renderer` actually executes inside an `<iframe
  sandbox>` with no direct DOM/Node access beyond an explicit bridged API.
  The liability-disclaimer warning still appears before first enable —
  informed consent *in addition to*, not instead of, real containment. See
  HLD §7 for the mechanism.
- **Why this is enough for P0/P1**: it matches how the platform is actually
  going to be used at this stage — a small, product-owner-curated set of
  "official" extensions (the starter pack: Bambu/Elegoo connectivity, Arachne
  engine, core viewport tools) plus whatever a developer/tinkerer chooses to
  load themselves, eyes open. It defers the harder problem (real code
  sandboxing for a public marketplace with untrusted authors) to P2+, without
  blocking anything in the meantime.
- **Signing mechanism** (implementation detail, see HLD §7): a manifest-level
  signature field, verified against a public key bundled with the app at
  build time; the store repo (wherever it's hosted — TBD, ties into PRD v1
  §8's original "artifact storage" open question) is the only party that can
  produce a valid signature, since only it holds the private key.

## 10. UI Modes: Simple vs. Advanced

Two first-class UI modes, switchable per-user (not per-install) — this is a
**composition concern**, not a new runtime or contribution point: both modes
are built from the same extensions (§3), just assembled differently.

- **Simple mode**: a guided, wizard-driven flow for beginners to go from "I
  have a model" to "it's printing" with minimal decisions. Built as a
  sequence of `wizard.step` contributions (§3, §7 P1) — e.g. pick/browse a
  model (potentially via a `content.repository` extension — see below),
  auto-suggest printer + filament from what's already configured, one-click
  slice with sensible defaults, send to print. Advanced settings (per-object
  overrides, engine parameter tuning, viewport tool details) are hidden
  entirely in this mode, not just collapsed.
- **Advanced mode**: the traditional full-featured slicer UX — the direction
  this app already had (filament/printer profile management, model editing
  via `viewport.tool` extensions, full slicing settings via the three-tier
  override model, post-slicing processing such as a "true color print"
  `gcode.postProcessor` — multi-material/color-change G-code injection — and
  a print manager surfacing `printer.connection` status/controls across all
  configured printers).
- **`content.repository` as its own contribution point** — yes: MakerWorld/
  Printables/NexPrint-style browsing is exactly the shape of the taxonomy's
  other categories (a well-defined capability — search, fetch model +
  metadata — that varies per source but shares one contract). It's useful in
  *both* modes (Simple mode's guided model-picker step, Advanced mode's
  ordinary "Import from..." menu item), which is why it's a contribution
  point on its own rather than something bolted only onto the Simple-mode
  wizard.
- **Mode is a rendering/composition choice in the renderer**, not a different
  build or a different set of loaded extensions — switching modes doesn't
  reload extensions, it changes which `viewport.tool`/`ui.panel`/`wizard.step`
  contributions the shell actually renders. This keeps "extend without
  forking" true for mode-specific UI too: a third-party extension can declare
  it belongs in Simple mode, Advanced mode, or both.
