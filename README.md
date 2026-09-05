# kuziSlicer

kuziSlicer is an Electron desktop application for loading 3D models, slicing them, previewing G-code, and sending validated jobs to supported printers on a trusted LAN.

## Elegoo Centauri Carbon support

The Centauri Carbon path uses the installed official ElegooSlicer engine and its official 0.4 mm nozzle, 0.20 mm Standard, and material profiles. The old internal generator is a prototype and its output is deliberately blocked from direct Elegoo printing.

Requirements:

- Windows with ElegooSlicer installed in `C:\Program Files\ElegooSlicer`
- Elegoo Centauri Carbon with a 0.4 mm nozzle
- Generic or Elegoo PLA, PETG, ABS, ASA, TPU 95A, or PC matching an installed official profile; Generic Nylon uses ElegooSlicer's Generic PA profile
- Printer and computer on the same trusted LAN

Workflow:

1. Run `npm install` and `npm run dev` (use `npm.cmd` if PowerShell blocks `npm.ps1`).
2. In Printer Management, add the Elegoo Centauri Carbon, its IPv4 address, and port `80`; use Test Connection.
3. Load an STL in the 3D Viewer.
4. Select `Elegoo Centauri Carbon` and a PLA filament, then generate G-code.
5. Review the G-code and click Print. Keep the bed clear and supervise the first layer.

Direct printing validates that the file contains heating, motion, and extrusion commands and rejects prototype output and embedded `BED_MESH_CALIBRATE` commands.

## Development

```powershell
npm.cmd run build
npm.cmd run test:gcodepipeline
npm.cmd run test:gcodevalidation
npm.cmd run test:elegooslicer
```

The last test invokes the locally installed official ElegooSlicer and verifies real Centauri Carbon G-code output.

## Current limitations

- Verified direct slicing is currently limited to STL, a 0.4 mm nozzle, the 0.20 mm Standard process, and installed official Elegoo material profiles.
- The legacy internal generator remains available for development profiles but is not production-grade slicing.
- LAN printing depends on printer firmware behavior; confirm firmware/profile compatibility and test with a small model first.
