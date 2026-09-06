# Rapid printer extensions

The exact extension type is `rapid printer extension`. A TypeScript extension owns its profiles, package validation and abortable communication implementation. `registry.ts` explicitly registers reviewed modules; it does not execute arbitrary downloaded scripts. The existing native PluginHost remains separate.

## Create an extension

Run `npm run printer:new -- manufacturer-model`. Implement the generated `prepare` and `connect` hooks, supply profiles and supported firmware identifiers, and register the module in `registry.ts`. The template deliberately rejects printing until implemented. Keep its JSON manifest consistent with the runtime manifest.

Run `npm run printer:bench -- --extension src/printer-extensions/manufacturer-model/index.ts --file path/to/project.gcode.3mf --nozzle 0.4`. The bench runs shared regression suites, validates the candidate registry contract and calls its package validator. Add printer-specific scenarios alongside these suites for each new transport; the shared tests alone do not certify another printer.

## A1 mini

The bundled extension has stock LAN firmware support and profiles for 0.2, 0.4 and 0.6 mm nozzles. Native vendor presets and their dependencies are under `bambulab-a1-mini/native`; they are reference resources, not a newly integrated slicing backend. Export a sliced project with Bambu Studio or OrcaSlicer for the actual installed nozzle.

In the G-code tab select an A1 mini printer, enter its LAN access code and serial, then select the original `.gcode.3mf` in the extension panel. The panel exposes print, status, pause, resume and stop. Raw G-code replacement inside an unrelated template is blocked. Exactly one sliced plate must be present; its path and archive bytes are preserved.

MQTT uses TLS on 8883 and FTPS uses implicit TLS on 990. Self-signed printer certificates are accepted to match Bambu LAN behavior. Connection operations have deadlines, upload is followed by a readiness check, concurrent dispatch to one address is rejected, and a start is never automatically retried. A matching printer job report confirms acceptance; it does not establish completion.

## Bench and hardware evidence

`npm run test:printerextensions` runs offline tests. `npm run printer:bench -- --file path/to/project.gcode.3mf --report artifacts/report.json` also validates an actual archive. No printer communication occurs without a hardware flag.

For hardware mode set `KUZI_PRINTER_IP`, `KUZI_PRINTER_ACCESS_CODE` and `KUZI_PRINTER_SERIAL` in the local environment. Add `--status` for read-only connection validation, or `--print` to dispatch the selected file once and monitor for up to 45 minutes (override with `--monitor-minutes`). A paused, failed, changed or unobservable job fails the run; no automatic retry or reset is issued. Check the installed nozzle, filament and clear bed before dispatch. Credentials are not written to the report. Printer-reported finish still requires physical inspection of the part.

The supplied 0.4 mm plate-3 project passed offline package validation. No completed physical print, 0.2/0.6 print, or local wire-protocol simulator run has been verified. Static package checks are not a complete G-code interpreter or safety certification.

## Migration and compatibility

Legacy printer data, Bambu packaging and Elegoo transport/slicing implementation now live here, with compatibility exports at the old paths. Only the A1 mini is registered under the new runtime contract. Legacy Elegoo behavior is retained; it has not been certified as a new extension. OpenCentauri targets Elegoo Centauri Carbon, not the A1 mini: https://github.com/OpenCentauri/OpenCentauri. A1 mini explicitly rejects that firmware identifier.

The application bundle includes native preset resources and the legacy archive template through electron-builder `extraResources`. Vendor preset provenance and AGPL license are retained in `native/`.
