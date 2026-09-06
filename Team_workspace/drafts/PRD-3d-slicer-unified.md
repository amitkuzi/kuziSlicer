# PRD: Unified Next-Gen 3D Slicer (kuziSlicer)

> **⚠️ SUPERSEDED (2026-09-06)** by [PRD-plugin-platform-v2.md](PRD-plugin-platform-v2.md).
> The slicing-engine feature synthesis below (§2–§13) is still valid and is
> referenced from the new PRD's §4 — only the product framing changed (this
> app is now a plugin platform first, a slicer second). Kept here for history.

Status: Draft (internal, English) — for Validator translation to `inbox/`
Author: Researcher agent, kuziSlicer project
Date: 2026-09-02

## 1. Vision

Build a new FDM-first 3D slicer that is not a fork of any single existing tool, but a
deliberate synthesis of the strongest, most mature ideas from five sources:
**PrusaSlicer**, **ElegooSlicer**, **OrcaSlicer**, **BambuStudio**, and the
**OpenBambuAPI** protocol documentation (connectivity domain). The product should feel
like what these four slicers would build today if they started clean: modern rendering,
multi-project workspace, guided calibration, vendor-agnostic connectivity, and a
three-tier settings model — without inheriting each tool's UI cruft or single-vendor
lock-in.

Sources are abbreviated below: **PS** (PrusaSlicer), **ES** (ElegooSlicer), **OS**
(OrcaSlicer), **BS** (BambuStudio), **OBA** (OpenBambuAPI).

## 2. Slicing Engine

- **Perimeters**: Arachne variable-width perimeter generator (PS origin, inherited by
  all four). This is table-stakes; adopt as-is rather than reinvent.
- **Seam handling**: OS's scarf seam (angled seam blending) as the default seam mode,
  with PS's classic seam-position strategies (nearest/rear/random/aligned) retained as
  alternatives.
- **Overhangs**: OS's overhang-aware speed/flow modulation, generalized as a
  first-class per-feature modifier rather than a bolt-on.
- **Fuzzy skin**: from PS, kept as a surface-texture option.
- **Mesh tooling**: BS's STEP import and PS's CSG mesh booleans + interlocking-joint
  generator — both are engineering-CAD-adjacent features aimed at mechanical parts,
  complementary rather than conflicting, take both.

## 3. Infill

- Unify around the shared library already common to PS/ES/OS/BS: Lightning, Adaptive
  Cubic, Gyroid, 3D Honeycomb, Rectilinear, Concentric.
- Adopt ES/BS/OS's **sandwich-mode infill** (distinct top/bottom-adjacent density vs.
  sparse core) as the default strategy for strength-vs-material tradeoff — it is the
  most broadly validated approach across three of the four sources.
- Keep infill pattern/density as per-object AND per-region overrides (see §8, tiered
  settings) rather than global-only.

## 4. Support Generation

- Two support engines, not one, mirroring PS's split but improving on BS/OS's hybrid
  model: (1) **Organic/tree supports** (PS origin, refined by BS's hybrid/tree/normal
  blend) as default for organic and overhang-heavy geometry; (2) **grid/legacy
  supports** retained for cases needing dense, easily-removed raft-like support
  (electronics enclosures, flat overhangs).
- Adopt PS's **auto support-spot detection** plus paint-on manual override (Gizmo-style
  brush) as the primary UX — this is the most mature implementation among sources.
- Tradeoff flagged: BS's "hybrid" auto-selection between tree/normal per-region is
  elegant but adds engine complexity. Recommendation: ship organic+grid at P0, treat
  automatic hybrid selection as a P2 heuristic layered on top, not a third engine.

## 5. Multi-Material / AMS & Wipe Strategy

- **Core conflict**: PS's dedicated external Wipe Tower vs. BS's flush-into-infill/
  objects waste strategy. These are genuinely incompatible at the G-code generation
  level (external purge structure vs. purging into the part).
- **Resolution**: make it a per-print **strategy setting**, not a fixed architectural
  choice — "External Wipe Tower" (PS-style, cleaner for visible parts, more reliable
  across arbitrary printer geometries) vs. "Flush to Infill/Object" (BS-style, less
  waste, requires the object to have infill volume available at the transition layer,
  print-quality-sensitive). Default to Wipe Tower for correctness/predictability at P0;
  add flush-to-infill as an opt-in P1 feature once infill-volume validation is solid.
- Adopt BS's AMS-aware filament mapping concept but generalize it: an abstract
  "multi-source filament" model that AMS, ES/manual multi-extruder, and single-extruder
  filament-swap workflows all implement, rather than hard-coding AMS semantics (ties
  into §9 connectivity abstraction).

## 6. Calibration & Tuning

- Adopt **OS's calibration wizard suite wholesale** as the headline differentiator in
  this area — temperature towers, flow-rate calibration, retraction tuning, pressure
  advance, all guided step-by-step with automatic parameter write-back into the active
  profile. None of the other three sources have anything comparably systematized; this
  is a clear "take the best" case, not a synthesis.
- Extend with BS's automatic brim generation (mechanical-analysis-driven) as an
  auto-calibration-adjacent feature under the same "Calibration" workspace tab.

## 7. Cooling & Speed

- Adopt BS's fan-speed/print-speed coupled cooling logic (jointly tuned rather than
  independently configured) as the default cooling model — it's the most advanced of
  the four.
- Adopt BS's arc G-code (G2/G3) generation as an optional output mode for firmware that
  supports it (smaller files, smoother curves); fall back to linear segments otherwise.

## 8. Presets, Profiles & Settings Architecture

- Adopt **BS's three-tier override hierarchy** (global → per-object → per-part) as the
  core settings model — finer-grained than PS/OS/ES's two-tier (global → per-object)
  and directly enables mixed-material, mixed-quality single-plate prints.
- Layer **PS's versioned Config Snapshots** on top for rollback/audit of profile
  changes over time (a project-level "settings history"), which none of BS/OS/ES have.
- Adopt PS's **Config Wizard** (first-run guided printer setup) combined with **ES's
  multi-manufacturer profile breadth** (explicit Anker/Anycubic/BambuLab/Creality/
  Prusa/RatRig/Voron assets) as the profile-library strategy — don't ship
  single-vendor-only profiles.
- Adopt PS's **favorites-based settings view** (from the 3.0-alpha rearchitecture) so
  the default settings panel shows a curated subset with an escape hatch to full
  advanced view, rather than OS/BS's flatter always-full panels.

## 9. Printer Connectivity & Remote Monitoring

This is the highest-risk area (see §13 Risks) and needs an explicit architecture, not
ad-hoc per-vendor code.

- **Architecture**: an abstract **Printer Connection Layer** with a common interface
  (connect, auth, send-file, start/pause/stop print, get-telemetry, get-camera-stream,
  raw-gcode-passthrough) and pluggable **protocol adapters** per vendor/firmware family:
  - Bambu-style adapter (MQTT+TLS, FTPS, LAN File Tunnel) implementing OBA's documented
    protocol, isolated behind the abstraction so protocol breakage on firmware updates
    is contained to one adapter.
  - Klipper/Moonraker, OctoPrint, PrusaLink adapters (OS has the broadest existing
    cross-firmware support here — use OS's compatibility matrix as the baseline
    requirement).
  - Generic network-discovery (Bonjour, from PS) for local printers that don't need
    cloud auth.
- **Auth model**: support both local-only (LAN access code / API key) and
  cloud-account-mediated flows per adapter, since OBA documents that Bambu's local-only
  path is being eroded by mandatory cloud-issued X.509 client certs (as of Jan 2025).
  Do not assume any vendor's "local mode" claim will remain purely local — build the
  adapter to degrade gracefully (warn user, fall back to cloud auth) rather than break
  silently on firmware updates.
- **Camera streaming**: treat as adapter-specific capability, not a core assumption —
  OBA documents three incompatible transports for Bambu alone (RTSPS, custom TCP+TLS
  JPEG, cloud P2P relay). The connection layer exposes a generic
  `getCameraStream() -> stream | unsupported` capability flag; UI degrades gracefully
  when unavailable.
- **Raw G-code passthrough**: expose but gate behind an explicit "advanced/unsafe"
  confirmation, since OBA notes this path bypasses printer safety interlocks on Bambu
  firmware — assume similar risk exists on other adapters and gate uniformly.
- **Telemetry**: normalize push (X1-style full state) vs. poll (P1-style delta,
  rate-limited) into one internal event model so the UI doesn't special-case per-vendor
  update cadence.

## 10. Workspace & Project Management

- Adopt **BS's multi-plate management** and **PS 3.0-alpha's multi-bed-in-one-project +
  multiple project tabs** as the same underlying feature (they converged
  independently — strong signal this is the right direction): one project can contain
  multiple beds/plates, potentially targeting different printers, open across multiple
  tabs.
- Adopt BS's auto-arrange/auto-orient and assembly/explosion view for multi-part
  models.
- Adopt PS 3.0-alpha's removal of the historical 9-bed/plate limit.

## 11. 3D Viewport & Rendering

- Adopt PS 3.0-alpha's modernized PBR rendering (ambient occlusion, shadows) and view
  cube camera control as the visual baseline — this is the most current rendering work
  among all sources.
- Adopt PS's Gizmo system (paint-on supports, seam painting, hollowing for future
  SLA) as the interaction model for in-viewport editing, since it's the most mature
  and already generalizes across multiple paint-based tools.
- Light/dark UI modes (PS 3.0-alpha) as a baseline requirement, not a stretch goal.

## 12. UI/UX Philosophy — What Makes This "Modern"

The point of unifying five sources is that the resulting UX is not a clone of any one
of them. Concretely:

- **Workspace shape**: PS 3.0-alpha's left-sidebar mode switcher (Slicing / Connect /
  Printables-style catalog) generalized to (Slicing / Connect / Calibration / Library),
  replacing the older single-purpose-window model of PS-classic/OS/BS.
- **Settings surface**: favorites-first (§8) instead of a wall of every parameter;
  fuzzy search (PS) always available as an escape hatch.
- **Embedded web panel concept (ES)**: reuse the pattern — not the exact tech — for a
  built-in "Home / Guides / Printer Management" panel, so first-run onboarding,
  firmware update prompts, and printer status don't require leaving the app or opening
  a separate browser tab.
- **Background jobs**: PS's Jobs subsystem (arrange, orientation optimization run
  async with progress) as the concurrency model for any non-trivial computation, so the
  UI never blocks on slicing/arranging.
- **Notifications**: PS's Hint Notifications pattern, extended to surface calibration
  suggestions (OS-style) and connectivity degradation warnings (§9) in one consistent
  toast/notification system.
- **Net effect**: a single coherent app that feels like a modern SaaS-quality desktop
  tool (multi-project tabs, guided wizards, live camera/telemetry, PBR viewport) rather
  than a dialog-heavy engineering tool from 2018.

## 13. SLA / Resin (Stretch / Optional)

- Only PS has a first-class SLA engine (dedicated support tree, hollowing, island
  sampling). None of ES/OS/BS ship SLA.
- Recommendation: **out of scope for P0/P1**. SLA is effectively a second slicing
  engine (different physics: layer exposure, resin supports, hollowing/drain-holes) —
  bolting it onto an FDM-first architecture as an afterthought produces the kind of
  awkward split PS itself has. Revisit as a dedicated P2+ project only if there's
  confirmed resin-printer demand in the user base.

## 14. Non-Goals / Out of Scope

- Not building a new print-host/OctoPrint replacement — the connectivity layer
  integrates with existing hosts/firmware, it does not reimplement Moonraker/OctoPrint
  server-side functionality.
- Not targeting industrial/multi-tool-changer printers (e.g., E3D ToolChanger-class
  hardware) at P0 — single/dual extruder and AMS-style multi-material only.
- Not shipping cloud account infrastructure of our own (no first-party cloud slicing
  service) — connectivity adapters talk to vendors' existing cloud services where
  required (e.g., Bambu cloud auth), we don't host print-farm management.
- SLA/resin excluded at P0/P1 (see §13).
- Not attempting belt/conveyor printer support at P0 (OS has this as nightly/
  experimental only — revisit post-P1 if demand exists).

## 15. Risks

- **Protocol fragility (OBA)**: the Bambu adapter is built against an unofficial,
  reverse-engineered protocol with no stability guarantee; it can break on any Bambu
  firmware update. Mitigation: isolate behind the adapter abstraction (§9), add
  adapter-level version/capability negotiation, and monitor the OpenBambuAPI community
  for breaking changes.
- **Local-auth erosion**: Bambu's shift toward mandatory cloud-issued certs for local
  control undermines any "fully offline" product claim for that adapter specifically.
  Do not market offline-only operation as a universal guarantee — scope that claim to
  adapters that genuinely support it (Klipper/OctoPrint/PrusaLink).
- **Camera fragmentation**: three incompatible transports for one vendor alone (OBA);
  expect ongoing adapter-specific maintenance burden, not a single reusable camera
  module.
- **SLA as a large separate investment**: flagged in §13 — treat as a distinct
  future project, not a checkbox feature.
- **Licensing**: PS, BS, OS, and ES are all GPLv3 (PS/OS/ES) or AGPL-influenced
  (verify BS's exact license before any code reuse — Bambu has historically imposed
  additional restrictions beyond stock PrusaSlicer's GPLv3). If any engine code
  (Arachne, supports, infill) is reused rather than reimplemented, the resulting
  product inherits GPLv3 obligations (source disclosure, same-license distribution).
  Decision needed before P0 implementation: reuse PS/OS engine code under GPLv3
  (fastest path, GPL obligations apply to the whole product) vs. reimplement core
  slicing math independently (slower, enables a non-GPL license). This is a legal/
  product decision, not just technical — flag to project owner explicitly.

## 16. Phased Priority

**P0 (MVP — core slicing + one connectivity path)**
- Arachne perimeters, shared infill set + sandwich mode, organic+grid supports with
  auto-detect + paint override, three-tier settings hierarchy, Config Wizard +
  multi-vendor profiles, Wipe Tower multi-material, PBR viewport baseline, Gizmo
  paint-on-supports, one connectivity adapter (Klipper/Moonraker recommended over
  Bambu — no cert/erosion risk) with basic telemetry, multi-plate/multi-bed single
  project.

**P1 (Feature parity + connectivity breadth)**
- OS-style calibration wizard suite, scarf seam, overhang-aware modulation, Config
  Snapshots, favorites-based settings view, Bambu adapter (MQTT/FTPS) with capability
  flags and graceful degradation, flush-to-infill wipe strategy as opt-in, BS coupled
  cooling logic, arc G-code output, embedded web-style Home/Guides panel, background
  Jobs subsystem, Hint Notifications.

**P2 (Differentiation + stretch)**
- Camera streaming per-adapter, hybrid auto tree/grid support selection, STEP import +
  CSG booleans + interlocking joints, assembly/explosion view, auto-arrange/auto-orient
  polish, belt/conveyor experimental support, SLA/resin engine evaluation (separate
  go/no-go decision), light/dark theming polish, fuzzy search across all settings.
