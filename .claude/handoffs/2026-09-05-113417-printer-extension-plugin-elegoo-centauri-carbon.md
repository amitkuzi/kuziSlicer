# Handoff: Rapid Printer Extension plugin type + Elegoo Centauri Carbon (verified live print)

## Session Metadata
- Created: 2026-09-05 11:34:17
- Project: D:\Development\kuziSlicer\.claude\worktrees\kuzislicer-submodule-structure-c4b75d
- Branch: claude/kuzislicer-submodule-structure-c4b75d
- Session duration: ~3-4 hours, spread across several user turns (including two physical printer reboots)

### Recent Commits (for context)
  - a7a0840 chore: Update kuziSlicer.extensions submodule URL after GitHub rename
  - 5b1e3fd fix: Elegoo Centauri Carbon startPrint payload -- verified working print
  - d776e6d feat: Add Elegoo Centauri Carbon nozzle profiles + printer extension plugin
  - 8fa6926 feat: Add kuziSlicer.extensions and PluginHost as submodules under src/plugins
  - 54375f9 feat: Add Elegoo Centauri Carbon LAN printing (SDCP protocol)

  Plus, in the `kuziSlicer.extensions` submodule (separate git repo, see below):
  b9bd2b9, fb28d9f, 0277983, ac028e9, e667fc0, 9e8f898, and merge commit ca4e1cd
  (reconciling with arcane-engine/overhang-detector/profile-importer plugins
  pushed directly to GitHub by the user in a different session).

## Handoff Chain

- **Continues from**: None (fresh start)
- **Supersedes**: None

> This is the first handoff for this task.

## Current State Summary

Built a new plugin type ("rapid printer extension") for printer network
communication, plus a complete, **verified-working** implementation for the
Elegoo Centauri Carbon, plus a template for writing new printer plugins, plus
a three-tier test bench. A real print was started and confirmed running on
the user's physical printer (192.168.1.12) via `testbench/live-print.mjs`.
All code is committed and pushed to both repos' remotes (`kuziSlicer` main
repo, branch `claude/kuzislicer-submodule-structure-c4b75d`, and the
`kuziSlicer.Extensions` submodule, branch `main`).

**What's NOT done yet, and is the reason this handoff exists**: none of this
is wired into the actual Electron app's UI. The user asked for (1) a tutorial
on using the plugin template to write a new printer plugin, and (2) a
tutorial on using the Elegoo Centauri Carbon extension "in the main
application UI" — but #2 is currently impossible to write truthfully because
**the app's UI/IPC layer still only knows about the old, separate,
pre-existing `src/main/clients/elegooPrinterClient.ts`** (used by
`GcodeViewer.tsx` via IPC channels `printer:elegoo-print` /
`printer:elegoo-snapshot`), not the new plugin in
`src/plugins/extensions/plugins/elegoo-centauri-carbon/`. The next agent's
first job is almost certainly to either (a) wire the new plugin into the
app's IPC layer so the UI tutorial can be about the real thing, or (b)
write both tutorials clearly stating current status: template tutorial is
fully accurate; UI tutorial must explain that live UI use isn't wired up yet
and show the testbench CLI scripts as the only way to drive it today.

## Codebase Understanding

## Architecture Overview

Two separate, NOT-related plugin systems exist in this codebase now:

1. **`.NET PluginHost` engine plugins** (`src/plugins/PluginHost`, C#,
   subprocess-based, GPL-isolated) — for slicing-engine plugins only
   (arachne perimeters, infill, supports, wipe-tower). Orchestrated from
   `src/main/services/pluginManager.ts` + `src/main/clients/pluginHostClient.ts`.
   **Not relevant to this task.**

2. **`kuziSlicer.extensions` in-process TS plugins** (`src/plugins/extensions`,
   a separate git submodule/repo) — historically just a placeholder
   (`example-plugin`), with zero runtime wiring into the actual app (no
   loader code anywhere references it). This session added a NEW plugin
   *type* here: "rapid printer extension", for printer network communication
   (discover/upload/print/pause/resume/cancel/status/camera). A parallel,
   independent session (not this one) also pushed real P0 "engine-style"
   plugins directly to this same repo (`arcane-engine`, `overhang-detector`,
   `profile-importer`) with their own build system (`scripts/build.mjs`) —
   these were merged in cleanly (see "Decisions Made" below) but are
   unrelated to the printer-extension work.

The pre-existing, separate, still-active printer client code
(`src/main/clients/elegooPrinterClient.ts`, `bambuPrinterClient.ts`) is
wired into the real app via `src/main/main.ts` IPC handlers and
`src/renderer/components/Tabs/GcodeViewer.tsx`. **This session's new plugin
does not replace or touch that code** — it's a parallel, currently-unwired
implementation living in the extensions submodule.

## Critical Files

| File | Purpose | Relevance |
|------|---------|-----------|
| `src/plugins/extensions/plugins/_template-printer-extension/` | Copy-this-folder starting point for a new printer plugin | For the "how to use the template" tutorial |
| `src/plugins/extensions/plugins/_template-printer-extension/README.md` | Step-by-step instructions already written for using the template | Base the tutorial on this, don't duplicate from scratch |
| `src/plugins/extensions/plugins/_template-printer-extension/src/printer-extension-contract.ts` | The `PrinterExtensionPlugin` interface + manifest schema (vendored copy, not a shared package) | Explain this contract in the tutorial |
| `src/plugins/extensions/plugins/elegoo-centauri-carbon/src/index.ts` | Elegoo plugin adapter (implements the contract) | Reference implementation for the tutorial |
| `src/plugins/extensions/plugins/elegoo-centauri-carbon/src/sdcp.ts` | Low-level SDCP v3 wire protocol (discover/upload/startPrint/status/pause/resume/cancel/camera) | Where the hard-won protocol fixes live (see Gotchas) |
| `src/plugins/extensions/testbench/TESTPLAN.md` | Three-tier test plan (manifest/wiring, mock-server, live-hardware) | Explains how ANY new plugin gets validated |
| `src/plugins/extensions/testbench/run.mjs` | Mock-server-based automated tests (`node testbench/run.mjs`) | Currently the only way to "run" the plugin without touching the real app |
| `src/plugins/extensions/testbench/live-check.mjs`, `live-print.mjs`, `live-filelist.mjs`, `live-snapshot.mjs` | Opt-in real-hardware scripts | Currently the ONLY way to actually use the Elegoo plugin against a real printer -- there is no UI path yet |
| `src/main/main.ts` (lines ~147-172) | Existing IPC handlers for the OLD `elegooPrinterClient.ts` (`printer:elegoo-print`, `printer:elegoo-snapshot`) | If wiring the new plugin into the UI, this is the pattern to follow/replace |
| `src/renderer/components/Tabs/GcodeViewer.tsx` (lines ~211-406) | Existing UI for sending to a printer (Bambu/Elegoo detection regexes, printer dropdown, "Camera Snapshot" button) | If wiring the new plugin into the UI, this is where the button/flow lives today |
| `src/data/printers.json` | Static printer profile catalog | This session added `elegoo-centauri-carbon-02/-06/-08` nozzle variants alongside the existing `-04` entry |

### Key Patterns Discovered

- No test framework anywhere in this repo (main app or extensions submodule)
  — `node:assert` + esbuild-bundle-and-eval for the main app's
  `scripts/test-*.mjs`; the extensions submodule's OTHER plugins
  (arcane-engine etc, from the parallel session) use `node:test` +
  `node --test` on compiled `.test.js` files instead. This session's
  testbench follows the main-app style (esbuild bundle-and-eval), since it
  needs mock network servers, not just pure-function assertions.
- Every plugin in `kuziSlicer.extensions` is fully self-contained: own
  `package.json`, `tsconfig.json`, no shared/hoisted contract package —
  small shared files (like the printer-extension contract) are vendored
  (copy-pasted) into each plugin rather than built as a workspace package.
  This is deliberate (see CLAUDE.md in that repo) — don't "fix" it by adding
  a monorepo/workspace setup.
- The extensions submodule has NO node_modules of its own for the testbench
  — `esbuild` is resolved from the MAIN repo's `node_modules` via Node's
  upward directory-walking module resolution (testbench scripts must be run
  with cwd inside `src/plugins/extensions`, but `npm install` only needs to
  have been run once at the MAIN repo root, not inside the submodule).

## Work Completed

### Tasks Finished

- [x] Designed `PrinterExtensionManifest` + `PrinterExtensionPlugin` contract
- [x] Built `_template-printer-extension` (copy-this-folder plugin starter, with README)
- [x] Built `elegoo-centauri-carbon` plugin (discover/upload/print/pause/resume/cancel/status/camera)
- [x] Built 3-tier test bench (manifest, mock-server, opt-in live-hardware scripts) + TESTPLAN.md
- [x] Added 3 nozzle-variant printer profiles to `src/data/printers.json`
- [x] Found and fixed the REAL root cause of 5 live-hardware crashes (see Gotchas)
- [x] **Verified an actual successful print start on real hardware** (Ack=0, `state=printing`, temps ramping, camera snapshot confirming)
- [x] Merged with a parallel session's direct-to-GitHub push (arcane-engine/overhang-detector/profile-importer) without losing either side's work
- [x] Committed and pushed both repos (main repo branch + extensions submodule)

## Files Modified

| File | Changes | Rationale |
|------|---------|-----------|
| `src/plugins/extensions/plugins/_template-printer-extension/*` (new) | Full template plugin | Rapid-development starting point, per user request |
| `src/plugins/extensions/plugins/elegoo-centauri-carbon/*` (new) | Full plugin implementation | Per user request, "full communication to stock and OpenCentauri firmware" |
| `src/plugins/extensions/testbench/*` (new) | Test bench, 3 tiers | Per user request, "create a TestPlan... implement a test bench" |
| `src/data/printers.json` | +3 nozzle-variant profiles | Elegoo Centauri Carbon supports 0.2/0.4/0.6/0.8mm nozzles |
| `src/plugins/extensions/package.json` | Merge-resolved: kept both build systems (`scripts/build.mjs` from parallel session + `test:testbench` from this session) | Avoid losing either session's tooling |
| `.gitmodules`, `.git/config` (local) | Updated extensions submodule URL after GitHub renamed the repo `kuziSlicer.extensions` → `kuziSlicer.Extensions` | Push was rejected/redirected otherwise |

## Decisions Made

| Decision | Options Considered | Rationale |
|----------|-------------------|-----------|
| New plugin type lives in `kuziSlicer.extensions` (in-process TS), not `.NET PluginHost` | .NET PluginHost (subprocess, GPL-isolated) vs in-process TS | Printer plugins need plain Node socket/HTTP access; no GPL concerns; PluginHost's subprocess-per-invocation model doesn't fit a stateful network client well |
| Contract is vendored per-plugin, not a shared npm package | Shared workspace package vs copy-paste | Matches existing repo convention (see CLAUDE.md in extensions repo); avoids adding monorepo tooling for ~100 lines of interface code |
| `startPrint`'s Filename is always bare, never path-prefixed | Path-prefixed (per `GET_FILE_LIST` display format) vs bare | Traced to Elegoo's own official client source (`github.com/ELEGOO-3D/elegoo-link`) — confirmed correct via live test |
| `startPrint` sends full payload (`Calibration_switch`, `PrintPlatformType`, `Tlp_Switch`, `slot_map`) not the "minimal" `{Filename, StartLayer}` from a prior session | Minimal payload (prior session's fix) vs full payload | Prior session's fix was WRONG — traced to the vendor SDK, these fields are required with off/empty defaults, not optional cruft. Confirmed via live test: minimal payload crashed the printer's SDCP stack 5 times in a row; full payload printed successfully first try |
| Merged (not force-pushed) when the extensions submodule remote had diverged | Merge vs force-push | Never discard another session's real work; the diverging commit contained substantial plugins (arcane-engine etc), not something to overwrite |

## Pending Work

## Immediate Next Steps

1. **User is waiting on two tutorials right now** (this is what triggered
   this handoff): (a) how to use `_template-printer-extension` to build a
   new plugin, and (b) how to use the Elegoo Centauri Carbon extension "in
   the main application UI." For (b), be upfront that it is NOT currently
   wired into the UI — either write the tutorial around the testbench CLI
   scripts as the current way to use it, or first do the IPC/UI wiring work
   (see below) so the tutorial can be about the real UI flow.
2. If wiring into the UI: add new IPC channels (e.g. `printer:plugin-invoke`
   or reuse `printer:elegoo-print`/`printer:elegoo-snapshot` but redirect
   their implementation to call the new plugin's `src/index.ts` methods
   instead of the old `elegooPrinterClient.ts`), following the exact pattern
   at `src/main/main.ts` lines ~147-172 and the UI at
   `GcodeViewer.tsx` lines ~211-406. Note esbuild/electron-builder currently
   has no bundling step for `src/plugins/extensions/plugins/*/src/*.ts` --
   main.ts would need to import compiled `dist/index.js` (each plugin's
   `npm run build`) or the whole plugin source would need bundling into the
   main app's esbuild step.
3. Consider whether `PrinterExtensionPlugin`'s `getStatus`/pause/resume/
   cancel/camera capabilities should surface in `GcodeViewer.tsx` (currently
   that UI only has a "Camera Snapshot" button for Elegoo, nothing for
   pause/resume/cancel/live-status-polling).

### Blockers/Open Questions

- [ ] No blocker on the printer itself — it's confirmed idle and responsive
  as of the last live-print test, no reboot pending.
- [ ] Open design question: should the new plugin type's manifest.json files
  actually be loaded by a real loader (there is currently NONE — even the
  original `example-plugin` was never loaded by anything), or does "using
  the plugin" for now just mean "importing its compiled JS directly from
  wherever main.ts needs it"? This affects how deep the UI-wiring work goes.

### Deferred Items

- IPC/UI wiring for the new plugin (see above) — deferred because scope so
  far was "build + validate the plugin," which is done and verified; wiring
  into the live app UI was never explicitly asked for until this exact
  request ("how to use... in the main application UI"), which is really a
  soft request to now also do that wiring, not just document something that
  doesn't exist yet.
- A real plugin *loader* for `kuziSlicer.extensions` in general (beyond this
  one plugin) — out of scope, not requested.

## Context for Resuming Agent

## Important Context

- **The plugin WORKS on real hardware** — this isn't theoretical. Ack=0,
  actual print started, temps ramped, camera confirmed. Don't re-litigate
  the protocol; it's right. Full history of the debugging (5 crashes,
  root-caused via the vendor's own C++ SDK source, not guesswork) is in
  memory: `elegoo_sdcp_client.md` (see auto-memory system,
  `C:\Users\amitk_bhx\.claude\projects\D--Development-kuziSlicer\memory\`).
- **The user's printer previously went unresponsive repeatedly (5 times)
  during this debugging** — always right after a malformed `startPrint`
  call, always required a physical power-cycle to recover. The payload is
  now fixed and verified correct, but if ANY future change touches
  `sdcp.ts`'s `startPrint()`, treat it with extreme care: test against the
  mock server first (`testbench/run.mjs`, which now asserts on the exact
  payload shape sent), and warn the user before any further live-hardware
  test. Never revert to a "minimal payload" without re-reading
  `elegoo_sdcp_client.md`'s explanation of why that's wrong.
- **Two separate git repos are involved**: the main `kuziSlicer` repo and
  the `kuziSlicer.extensions`/`kuziSlicer.Extensions` submodule (git
  submodule — note the repo was renamed on GitHub mid-session, capital E).
  Commits/pushes must happen in BOTH, in the right order (submodule first,
  then bump its pointer in the parent repo).
- **A parallel session pushed unrelated real work directly to the extensions
  repo's GitHub remote** (arcane-engine, overhang-detector, profile-importer
  — P0 slicing-engine-style plugins, different plugin type entirely, uses
  `scripts/build.mjs` + `node --test`). This was merged cleanly this
  session. Don't be surprised to see these plugins; they're not related to
  printer extensions and weren't built by this session.

## Assumptions Made

- Assumed the user wants a real, working printer plugin (not just scaffolding) — confirmed correct, they explicitly said "do iteration... until validated plugin can actually print an item."
- Assumed OpenCentauri doesn't need a separate protocol implementation (confirmed via research: it's SSH/tooling add-ons on stock firmware, doesn't replace SDCP).
- Assumed pushing to the submodule's `main` branch directly (not a feature branch) was fine, since that's the branch structure the parallel session was already using there (no PR-based workflow established in that repo yet).

## Potential Gotchas

- **Git Bash / MSYS path mangling**: passing a Unix-style absolute path
  argument (like `/local/...`) to a Node script through Git Bash on Windows
  gets silently rewritten to a Windows path (e.g.
  `C:/Program Files/Git/local/...`) unless you set
  `MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'` first. Bit this session once
  during manual protocol debugging (not in any committed script, just a
  gotcha to remember for ad-hoc diagnostics).
- **`GET_FILE_LIST`'s displayed filenames are path-prefixed** (e.g.
  `/local//foo.gcode`) but that's ONLY a display convention — `startPrint`'s
  `Filename` field wants the bare name. This tripped up two iterations of
  fixes this session; the final, correct, tested code
  (`verifyFileUploaded` + `startPrint`) gets this right — don't
  "re-fix" it back to path-prefixed based on re-reading `GET_FILE_LIST` output.
- The extensions submodule has no `node_modules` — testbench scripts rely
  on Node resolving `esbuild`/`ws`/`axios`/`form-data` from the MAIN repo's
  `node_modules` via upward directory walking. If someone runs
  `npm install` inside `src/plugins/extensions` itself, this still works
  (own node_modules would just shadow the parent's), but it was never done
  this session and isn't necessary.
- `printers.json`'s top-level shape is `{ printers: [...] }`, not a bare
  array — easy to trip up a naive `JSON.parse(...).findIndex(...)` (I hit
  this myself mid-session).

## Environment State

### Tools/Services Used

- `gh` CLI (GitHub) — used extensively for `gh api repos/.../contents/...`
  and `gh api repos/.../git/trees/...?recursive=1` to read remote repo
  source (OpenCentauri docs, ElegooSlicer's `deps/elegoolink.cmake`, and
  `ELEGOO-3D/elegoo-link`'s actual C++ source) without cloning — useful
  technique for tracing a vendor's real protocol implementation.
- `node_modules/.bin/tsc --noEmit -p <plugin>/tsconfig.json` — used
  throughout to type-check each plugin in isolation (they're not part of
  the main app's `tsconfig.json`).
- Real printer at `192.168.1.12` (Elegoo Centauri Carbon, MainboardID
  `2063141701045b4000000c0000000000`) — confirmed idle and responsive as of
  end of session.

### Active Processes

- None left running. All testbench scripts are one-shot CLI invocations, nothing daemonized.

### Environment Variables

- None relevant/secret. (The Bambu Lab client elsewhere in this repo takes
  an Access Code/Serial Number as session-only UI fields, not env vars —
  unrelated to this session's work.)

## Related Resources

- `C:\Users\amitk_bhx\.claude\projects\D--Development-kuziSlicer\memory\elegoo_sdcp_client.md` — full protocol debugging history and resolution
- `C:\Users\amitk_bhx\.claude\projects\D--Development-kuziSlicer\memory\printer_extension_plugin_type.md` — plugin architecture summary
- `src/plugins/extensions/testbench/TESTPLAN.md` — the test plan for any new printer plugin
- `src/plugins/extensions/plugins/_template-printer-extension/README.md` — existing template usage instructions (base the tutorial on this)
- Vendor source referenced: `github.com/ELEGOO-3D/elegoo-link` (official SDK), `github.com/OpenCentauri/OpenCentauri` (firmware add-on docs)
- GitHub PR #1 on `kuziSlicer` (from an earlier part of this same branch's history, re: submodule structure) — may or may not still be relevant/open, not re-checked this session

---

**Security Reminder**: Before finalizing, run `validate_handoff.py` to check for accidental secret exposure.
