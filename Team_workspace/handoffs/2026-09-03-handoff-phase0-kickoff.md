# Handoff: kuziSlicer P0 — Phase 0 Kickoff (2026-09-03)

**To:** Team (Architect, Implementors, Validator, CAD Expert, Designer)  
**From:** Operations Manager  
**Date:** 2026-09-03  
**Status:** Ready for assignment  
**Approval needed:** Architect sign-off on Phase 0 plan; Product Owner sign-off on §0 licensing decision

---

## Summary

**kuziSlicer P0** (MVP) work plan is finalized. **Phase 0** (architectural foundation) is **ready to start immediately** and unblocks all downstream phases (2–5). **Phase 1** (slicing engine) is **blocked** pending licensing decision (§0 in PRD §15) — waiting for Product Owner sign-off on GPL vs. Apache-2.0 choice.

**Deliverables created:**
1. ✅ **Detailed work plan** — `Team_workspace/drafts/2026-09-03-workplan-P0-complete.md` (27 tasks, 5 phases, all dependencies)
2. ✅ **Dependency graph** — Visual DAG showing critical path, blockers, parallel tracks
3. 📋 **This handoff** — Task assignments by role

**Recommended start:** Week 1 of Phase 0 (ASAP).

---

## What Blocks What (Critical Decisions)

### Blocker #1: §0 — Licensing Decision
**Status:** ⏸ WAITING FOR PRODUCT OWNER  
**Impact:** Blocks Phase 1 entirely; all other phases proceed independently.

**Decision needed:**
- **Option A:** GPL-3.0 (reuse Arachne + PrusaSlicer code)
  - **Cost:** kuziSlicer.PluginHost must be Apache-2.0 (no linking to GPL); P0 + Phase 1 ≈ 12–14 weeks (parallel Phase 1 from week 6).
  - **Risk:** Arachne protocol unstable (breaks with firmware updates); binaries must be open-source.
- **Option B:** Apache-2.0 (implement slicing engine independently)
  - **Cost:** Phase 1 +2–4 weeks (custom math implementation); total 14–18 weeks.
  - **Gain:** Full control, no GPL obligations, zero external dependencies.

**Who decides:** Product Owner + Legal (if applicable)  
**When:** **End of week 1** (before Phase 1 team kicks in) — escalate if slipping.  
**Action:** Reply in this document (or merge a decision note).

---

### Blocker #2: PluginHost Repo + CI Setup
**Status:** ⏸ WAITING FOR INFRASTRUCTURE DECISION  
**Impact:** Blocks 0.3, 0.7 (anything touching PluginHost from Electron side).

**Decision needed:**
1. **GitHub owner/org?** (kuziSlicer.PluginHost is currently private, local-only `D:\Development\kuziSlicer.PluginHost`)
2. **CI service?** (GitHub Actions, Azure Pipelines, other?)
3. **Maven/NuGet versioning strategy?** (Manual, auto-increment, conventional commits?)
4. **Artifact repository?** (GitHub Releases, Azure Blob, other?)

**Who decides:** DevOps / Infrastructure  
**When:** Week 1  
**Action:** Infrastructure creates repo, sets up `.gitignore` + first build pipeline.

---

## Phase 0 Assignments (7 Tasks, ~5–6 weeks)

### Prerequisites (Before Kickoff)
- [ ] **Architect:** Review work plan (`drafts/2026-09-03-workplan-P0-complete.md`) + dependency graph. Sign off on execution order. ← **Needed before task assignments.**
- [ ] **Product Owner:** Decide §0 (licensing) + PluginHost repo strategy. ← **Needed ASAP.**
- [ ] **Infrastructure:** GitHub + CI setup for kuziSlicer.PluginHost. ← **Needed by day 3 of week 1.**

---

### Immediate Assignments

#### **0.1 — TypeScript Interfaces for Plugins** (2–3 days)
**Owner:** Implementor (TypeScript specialist)  
**Pairs with:** Architect (API design review)  
**Deliverable:** `src/types/plugin-{engine,importer,overhang}.ts`

**Scope:**
- Define `PluginManifest` (name, version, permissions, entry point)
- Define `InvokeRequest` / `InvokeResult` (generic request-response)
- Define `ProgressEvent` (streaming events from plugin)
- Define `PluginPermissions` enum (file-read, file-write, network, cpu-limit, etc.)
- Document as JSDoc; ensure backwards-compatible versioning (SemVer in manifest)

**Acceptance:**
- [ ] All types export from `src/types/index.ts`
- [ ] Types used in 0.1-Host interfaces (`IPluginManifest`, etc.) align — **may require PluginHost team coordination**
- [ ] No `any` types; strict TypeScript
- [ ] README in `src/types/README.md` documenting plugin API contract

**Blockers:** PluginHost team must publish C# interfaces (`PluginHost.Contracts`) in parallel — coordinate by day 2.

---

#### **0.3 — Plugin Manager** (1–2 weeks)
**Owner:** Implementor (TypeScript + architecture)  
**Pairs with:** Validator (testing), Architect (design review)  
**Depends on:** 0.1-Host (skeleton), 0.2 (sandbox), 0.1 (interfaces)  
**Deliverable:** `src/main/services/pluginManager.ts` + UI in sidecar

**Scope:**
- Load plugin manifests from `plugins/` directory
- Spawn/kill plugin processes (via 0.7 PluginHost Client)
- Maintain registry: enabled/disabled state per plugin, versioning
- Persist state to `userData/plugins.config.json`
- UI controls: enable/disable toggles, version display, uninstall button
- Error handling: plugin crash → disable, show warning, don't crash Electron

**Test plan (Validator writes):**
- Unit: manifest validation (good, bad, missing fields)
- Unit: state transitions (load → enable → disable → unload)
- Integration: plugin process spawning + lifecycle (uses 0.7 client + mock process)

**Acceptance:**
- [ ] Plugin Manager can list installed plugins
- [ ] Enable/disable toggles persist across restart
- [ ] Plugin crash doesn't crash Electron
- [ ] 3+ unit tests, 2+ integration tests (green)

---

#### **0.4 — Refactor GcodeGenerator to Manager+Engine** (1.5 weeks)
**Owner:** Implementor (TypeScript, business logic)  
**Pairs with:** Validator (regression testing), Architect (layer review)  
**Depends on:** 0.1, 0.7 (PluginHost Client)  
**Deliverable:** `src/main/services/gcodeManager.ts` (new) + `src/main/services/engines/stlEngine.ts` (new logic)

**Current code location:** `src/main/services/gcodeGenerator.ts` (single file, mixed concerns)

**Scope:**
- **Manager layer:**
  - Reads user input (STL file, printer profile, print settings)
  - Validates (file exists, profile valid, settings in bounds)
  - Calls Engine for pure math
  - Ships result to storage / IPC
  - Error aggregation + user-friendly messages
  - Async/await with `AbortSignal` for cancellation
- **Engine layer:**
  - Pure functions: `parseSTL(buffer) → Mesh`
  - Pure functions: `generateLayers(mesh, settings) → Layer[]`
  - **Zero I/O:** no file reads, no IPC, no logging to external systems
  - Deterministic: same input → same output (for snapshot testing)
- **Accessor layer:**
  - Already exists in `src/main/services/profilesManager.ts`; reuse as-is
  - Inject into Manager via DI (constructor parameter)

**Test plan (Validator writes):**
- Unit: `StlParser` with fixture STL files (ascii + binary) → known mesh
- Unit: `GcodeGenerator` (pure logic) — snapshot test against known fixture output
- Unit: Manager layer (DI mock Accessor) — validation logic, error handling
- Integration: End-to-end (real FS, real file I/O) — STL → G-code file on disk

**Acceptance:**
- [ ] Engine functions are pure (no imports of fs/path/ipc/electron)
- [ ] Manager delegates to Engine correctly
- [ ] Snapshot of known fixture input matches previous version output (regression = 0)
- [ ] 5+ unit tests (Engine), 3+ unit tests (Manager), 2+ integration tests — all green
- [ ] TypeScript strict mode; no `any`, no `!` without comment

---

#### **0.5 — Refactor ProfilesManager to Accessor+Manager** (1 week)
**Owner:** Implementor (TypeScript, data modeling)  
**Pairs with:** Validator (data integrity testing)  
**Depends on:** 0.1  
**Deliverable:** `src/main/services/profilesAccessor.ts` (new, I/O layer) + refactored `src/main/services/profilesManager.ts`

**Current code location:** `src/main/services/profilesManager.ts` (mixed I/O + business logic)

**Scope:**
- **Accessor layer (new file):**
  - `readProfilesFromDisk(userData) → JSON`
  - `writeProfilesToUserData(profiles) → void`
  - Merge bundled profiles (`src/data/`) with user profiles (`userData/profiles/`)
  - Handle corrupted JSON gracefully (fallback to bundled)
  - Zero business logic; just I/O
- **Manager layer (refactored):**
  - `loadProfiles(accessor) → Promise<ProfileLibrary>`
  - Type conversions: raw JSON → DTOs (immutable, `readonly`)
  - Validation: required fields, schema
  - Inject Accessor via DI
- **Shared contracts:**
  - `IProfilesAccessor` — contract for Accessor
  - `Profile`, `PrinterProfile`, `FilamentProfile` DTOs — exported from types

**Test plan (Validator writes):**
- Unit: Accessor (mock FS) — reads/writes JSON without data loss
- Unit: Manager (mock Accessor) — loads, validates, merges profiles
- Integration: Real FS, real JSON files in `userData/`

**Acceptance:**
- [ ] Accessor only touches FS; Manager never does
- [ ] DTOs are `readonly`; no setters
- [ ] Bundled + user profiles merge correctly (user overrides bundled)
- [ ] Corrupted user JSON → fallback to bundled (no crash)
- [ ] 4+ unit tests (Accessor), 3+ unit tests (Manager) — all green

---

#### **0.6 — Cleanup Main.ts (IPC as Controller Only)** (3–4 days)
**Owner:** Implementor (TypeScript, IPC)  
**Pairs with:** Validator (integration testing)  
**Depends on:** 0.4, 0.5  
**Deliverable:** `src/main/main.ts` (refactored)

**Current state:** `main.ts` mixes IPC handlers + business logic (validation, file I/O).

**Scope:**
- Move all business logic to Manager/Accessor (0.4, 0.5)
- IPC handlers become **pass-through only**:
  ```typescript
  ipcMain.handle('gcode:slice', async (event, { file, profile }) => {
    return this.manager.sliceAsync(file, profile)
  })
  ```
- Centralized error handling in one middleware
- Logging injection (structured logs, no PII)
- All Manager calls via DI (no hardcoded `new`)

**Test plan (Validator writes):**
- Integration: IPC call → Manager → response (end-to-end, no mocks)

**Acceptance:**
- [ ] No business logic in `main.ts` (validation, file ops, etc.)
- [ ] All IPC handlers are <5 lines (pass-through only)
- [ ] Structured logging in place
- [ ] 2+ integration tests (IPC → Manager) — green

---

#### **0.7 — Plugin Host Client (Electron ↔ .NET Bridge)** (1.5 weeks)
**Owner:** Implementor (TypeScript, HTTP client)  
**Pairs with:** Validator (integration testing), PluginHost team (API contract)  
**Depends on:** 0.1-Host (PluginHost API spec), 0.7 needs infrastructure setup  
**Deliverable:** `src/main/clients/pluginHostClient.ts` + integration in `src/main/main.ts`

**Scope:**
- TypeScript wrapper around REST + SSE + SignalR to PluginHost:
  ```typescript
  class PluginHostClient {
    async invoke(pluginId: string, request: InvokeRequest): Promise<InvokeResult>
    stream(pluginId: string, request: InvokeRequest): Observable<ProgressEvent>
    cancel(pluginId: string): Promise<void>
  }
  ```
- Spawn `kuziSlicer.PluginHost.exe` (or `.dll`) as child process on app startup
  - Pass `--port=8888` to PluginHost
  - Wait for HTTP `/health` endpoint ready
  - Graceful shutdown on Electron quit
- Retry logic: exponential backoff if PluginHost crashes
- Error mapping: HTTP errors → user-friendly messages

**Test plan (Validator writes):**
- Integration: Start mock .NET server locally (`dotnet run PluginHost`), invoke endpoint, verify response
- Integration: Process respawn on crash (simulate `PluginHost.exe` exit code 1)

**Acceptance:**
- [ ] PluginHostClient spawns PluginHost process on `main.ts` startup
- [ ] `/health` polling succeeds within 5 seconds
- [ ] IPC method `gcode:sliceViaPlugin` calls PluginHostClient.invoke correctly
- [ ] Renderer receives progress updates via IPC (SSE → main.ts → IPC → renderer)
- [ ] 3+ integration tests — green
- [ ] Documentation in `docs/PLUGIN_HOST_SETUP.md` (how to build/run PluginHost locally)

---

### Phase 0 Parallel Track (Infrastructure)

**Owner:** Infrastructure / DevOps  
**Timeline:** Weeks 1–3 (parallel to task assignments)  
**Deliverables:**

1. **PluginHost GitHub repo**
   - [ ] Create `kuziSlicer.PluginHost` on GitHub (owner/org TBD)
   - [ ] Add `.gitignore` (C#/.NET), `LICENSE`, `README.md`
   - [ ] First commit: existing code from `D:\Development\kuziSlicer.PluginHost`
   - [ ] Add branch protection: main requires 1 review, CI pass

2. **CI/CD Pipeline**
   - [ ] GitHub Actions workflow: `dotnet build` + `dotnet test` on every PR
   - [ ] Publish passing build to GitHub Releases (auto-versioning)
   - [ ] Coverage reporting (optional but recommended)

3. **Build artifact for Electron**
   - [ ] kuziSlicer `package.json` post-install hook downloads latest PluginHost binary
   - [ ] If developer, can `npm run dev:plugin-host` to run locally
   - [ ] Production build (`npm run dist`) bundles PluginHost in installer

---

## Downstream Phases (Info Only — Do Not Start Yet)

### Phase 2 (Settings & Profiles) — 2–3 weeks
- **Owner:** Implementor (TypeScript, UI)
- **Start:** After Phase 0 complete (week 6–7)
- **Tasks:** 3-tier override stack, Config Wizard, manufacturer profiles

### Phase 3 (Connectivity) — 3–4 weeks
- **Owner:** Implementor (TypeScript, HTTP/async), CAD Expert (protocol research)
- **Start:** After Phase 0 complete (week 6–7, parallel to Phase 2)
- **Tasks:** Abstract printer interface, Klipper adapter, Bonjour, raw G-code gate, telemetry normalization

### Phase 4 (UI & 3D) — 2–3 weeks
- **Owner:** Implementor (TypeScript, Three.js), Designer (UX/UI)
- **Start:** After Phase 0 complete (week 6–7, parallel)
- **Tasks:** PBR rendering, support brush gizmo, dark mode, multi-bed tabs

### Phase 1 (Slicing Engine) — 6–8 weeks ⏸ BLOCKED
- **Owner:** PluginHost team (C#) + Implementor (TypeScript filament model)
- **Start:** Week 6+ (after Phase 0 + §0 decision)
- **Tasks:** Arachne engine, infill, support generation, wipe tower, abstract filament model

### Phase 5 (Acceptance) — 1 week
- **Owner:** Validator (E2E testing), all teams
- **Start:** After all other phases merge (week 12–14)
- **Tasks:** Bundle starter plugins, EULA modal, full workflow acceptance test

---

## Testing Strategy (All Phases)

**Rule:** Every new public method = test before merge.  
**Architecture:** Manager/Engine/Accessor pattern (from `csharp-standards` skill):
- **Engine:** Pure functions, no I/O, unit-testable, no mocks needed
- **Manager:** Orchestration, unit tests with mocked Accessor/Engine
- **Accessor:** I/O only, integration tests with real FS/DB

**Reporting:** After each completed task, report: `N tests ran, M passed, K failed` (even if all green). Post in task's PR comment.

**Gates:** All tests must pass before PR merge. Code review + Validator sign-off required.

---

## Risks & Mitigation

| Risk | Impact | Likelihood | Action |
|------|--------|------------|--------|
| §0 decision slips past week 1 | Phase 1 delayed 1–2 weeks | Medium | Escalate by day 5; pre-decide if needed |
| PluginHost spawn/kill unstable (Windows process management) | Affects 0.7 testing, Phase 1 launch | Medium | Spike early (week 2); use helper library (child_process + tree-kill) |
| Moonraker mock server missing for 3.2 tests | Phase 3 delayed | Low | Pre-stage docker-compose.yml; team can run locally |
| Arachne protocol docs outdated | Phase 1 implementation blocked | Medium | Research in parallel; document findings in `docs/` |

---

## Communication Plan

**Daily standup:** None (async culture). Use GitHub Issues + Discord for blockers.

**Weekly sync (Friday 14:00 Asia/Jerusalem):**
- [ ] Architect: review Phase 0 progress + blockers
- [ ] Product Owner: confirm §0 decision status
- [ ] Validator: test results, blockers
- [ ] Infrastructure: CI status, PluginHost repo readiness

**Monthly milestone review:** Every ~4 weeks (end of Phase) — full team sync.

---

## Approval Checklist (Before Starting)

- [ ] **Architect:** Phase 0 plan approved (handoff signature)
- [ ] **Product Owner:** §0 decision made (reply in this handoff)
- [ ] **Product Owner:** PluginHost repo + CI strategy approved
- [ ] **Validator:** Test plan template accepted
- [ ] **Infrastructure:** CI/CD spike completed; ready to set up

---

## Next Steps (When Approved)

1. **Day 1 week 1:** Architect + Product Owner sign off on this handoff (reply below).
2. **Day 1 week 1:** Infrastructure starts PluginHost repo + CI setup.
3. **Day 2 week 1:** Implementors start **0.1** (TypeScript interfaces) — coordinate with PluginHost team on C# ↔ TS interface alignment.
4. **Day 3 week 1:** Implementors start **0.4, 0.5** (refactor existing code) in parallel with 0.1.
5. **Day 5 week 1:** Validator begins writing test plans for 0.4, 0.5.
6. **Week 2:** Implementor starts **0.3** (once 0.1-Host + 0.2 are ready).
7. **Week 3:** Implementor starts **0.6, 0.7** (once 0.4, 0.5 complete).
8. **Week 4:** Phase 0 acceptance testing + integration.

---

## Signatures

**Approved by:**

- [ ] Architect (review + sign-off): _________________ Date: _______
- [ ] Product Owner (§0 decision + PluginHost strategy): _________________ Date: _______
- [ ] Operations Manager (handoff created): amitkuzi, 2026-09-03

---

**Document version:** 1.0  
**Last updated:** 2026-09-03 14:30 Asia/Jerusalem  
**Status:** Ready for signature
