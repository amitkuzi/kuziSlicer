# Rapid printer extension test plan

Written from the requested behavior before implementation. The required plugin type is exactly `rapid printer extension`. This TypeScript project uses the csharp-standards counter-model testing and review workflow; .NET architecture, records, DI and CancellationToken syntax rules do not apply. Equivalent runtime validation, bounded asynchronous work and secret handling remain review criteria.

| Behavior | Happy path | Validation failures | Edge cases | Level |
| --- | --- | --- | --- | --- |
| Discover and load extension | A manifest with the exact type exposes executable printer behavior, printer data and profiles | Wrong type, missing identifier/version, missing code entry point, malformed profiles, duplicate identifier, code outside extension directory | Empty registry; invalid JSON; disabled extension; existing plugin remains usable | Unit + filesystem integration |
| Template | Copy template, fill printer metadata and adapter implementation, load and exercise it | Placeholder/unsupported operations return actionable errors; no false success | No printer connected; no credentials persisted in template | Filesystem integration |
| Bambu A1 mini profiles | Stock 0.2, 0.4 and 0.6 mm configurations select consistent nozzle, dimensions and limits | Unsupported nozzle; mismatched printer model; impossible print dimensions | Profile identity remains unique; numerical boundary values | Unit |
| OpenCentauri adapter | Use officially documented supported firmware, endpoint and commands | Stock-firmware mismatch, unsupported API, rejected operation, invalid configuration | Disconnected device, invalid JSON, server error, timeout, cancellation | Unit at owned transport boundary; hardware integration gated by actual device availability |
| Attachment validation | Read supplied A1Test_0.4__plate_3.gcode.3mf, preserve plate path, validate target model/nozzle and content | Corrupt ZIP, missing G-code, wrong target model/nozzle, malformed or ambiguous plate data, oversized/unbounded archive | Multiple plates; no metadata; unsafe archive paths | Unit fixtures + real-file integration |
| Dispatch | Validate and upload to correct printer, request selected plate and confirm accepted state | Validation prevents upload; upload failure prevents start; command rejection is surfaced | Duplicate action, lost response, busy printer, delayed status; no blind start retry | Unit with owned adapter double + explicit hardware integration |
| Print lifecycle | Distinguish command acknowledgement, started, running, completed and failed | Device reports failure; lost connection; no acknowledgement; deadline expires | Cancellation and timeout settle promptly, clean up listeners/timers, never claim physical completion from dispatch alone | Unit + hardware integration |
| Test bench | Reproducible command exercises packaged extensions with deterministic simulator and reports failures through exit status | Broken extension or scenario exits nonzero; malformed fixture handled | No network/hardware required by default; no credentials in reports; all cases bounded | CLI integration |

## Gates and evidence

1. Implement the above as executable tests where the public API supports the behavior; review the final diff independently and report blockers, should-fix items and nits with file/line references.
2. Run existing plugin manager, G-code validation/pipeline, Bambu packaging and relevant protocol tests plus the new bench. Build both Electron and renderer bundles.
3. Record attachment filename, size, archive paths, target model/nozzle and selected plate without printing credentials or unrelated machine information.
4. Hardware confirmation is a separate result. Only report a real print as started after observed printer state confirms it; only report complete after an observed terminal success state. Missing connectivity, rejected authorization or protocol incompatibility must produce a bounded actionable result rather than waiting indefinitely.

## Independent review status

Plan prepared before production implementation. Test implementation, final adversarial review and hardware evidence pending.
