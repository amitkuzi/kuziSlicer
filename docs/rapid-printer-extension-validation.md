# Validation — 2026-09-06

- Production Electron/preload and Vite build: passed. Vite emits the existing CJS API and large-chunk warnings.
- Seven existing suites passed: pluginmanager, overrideengine, gcodepipeline, gcodevalidation, elegooslicer, elegooprotocol, bambupackaging.
- New offline suites: 42 cases passed (17 lifecycle/deadline, 13 archive, 8 registry, 4 transport input/abort). Transport cases do not simulate a live MQTT/FTPS server.
- Bench on supplied A1Test_0.4__plate_3.gcode.3mf: passed; preserves Metadata/plate_3.gcode and original archive digest. See artifacts/a1-mini-attachment.json.
- git diff --check: passed.
- Full tsc --noEmit: fails with 17 existing diagnostics. An isolated origin/main f4067a8 snapshot run using the same installed dependencies reports 18 diagnostics; the new profile source removes one prior printer-profile union error. No new diagnostics were introduced. Existing errors involve pluginHostClient nullability, main's inactive plugin host and removed Electron option, profilesAccessor's missing helper, filament profile union, Three.js module paths, and the VS Code splash implementation.

## Not established

No physical print was performed or certified. Actual firmware acceptance, print completion, nozzle swaps, and print quality need hardware runs. No wire-level simulator coverage is claimed. A1 mini does not support OpenCentauri; legacy Elegoo code is relocated with compatibility exports and is not registered/certified under the new extension contract. Native presets are bundled reference resources; a new slicing backend is not implemented.
