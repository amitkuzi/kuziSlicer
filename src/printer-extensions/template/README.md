# Rapid printer extension starter

SPDX-License-Identifier: GPL-3.0-or-later

This is the runnable startup shape for the canonical `rapid printer extension`
type. Copy it with the generator, then implement package preparation and an
abortable transport. The deliberate exceptions prevent accidental real-printer
commands before both hooks are implemented.

From the repository root:

```powershell
npm run printer:new -- acme-model
npm run test:printerextensions
npm run printer:bench -- --extension src/printer-extensions/acme-model/index.ts --file path/to/job.gcode.3mf --nozzle 0.4
```

The bench must be run against mocks first. For hardware, verify the printer is
idle and supported; transport methods must honor `AbortSignal`, close sockets on
failure, and never retry a `start` command.

The interface is `src/printer-extensions/core/types.ts`; the completed demo is
`src/printer-extensions/bambulab-a1-mini`.
