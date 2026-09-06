# Supplied archive evidence

Read locally with `fflate` on 2026-09-05; no hardware contacted by this inspection.

| Field | Observed value |
| --- | --- |
| Filename | A1Test_0.4__plate_3.gcode.3mf |
| Compressed archive size | 120,618 bytes |
| Actual G-code entry | Metadata/plate_3.gcode |
| G-code entry size | 331,233 bytes |
| Printer profile | Bambu Lab A1 mini 0.4 nozzle |
| Slice model identifier | N1 |
| Nozzle | 0.4 mm |
| Printable area and height | 180 × 180 × 180 mm |
| Layers | 88 |
| Material | PLA |
| Bed | Textured PEI Plate, configured at 65 °C |
| Nozzle temperature | Configured at 220 °C |
| Slice time prediction | 1,108 seconds |
| Material prediction | 2.83 g |

The archive retains thumbnail and project metadata for plates 1–3 but contains only plate 3 G-code. Dispatch must preserve `Metadata/plate_3.gcode`; assuming plate 1 is incorrect. `slice_info.config` includes a bed-temperature warning and unsupported traditional timelapse warnings. These are slicer metadata findings, not observed printer faults. Inspection confirms the selected profile and archive structure; it does not confirm the installed physical nozzle, bed condition or printer acceptance.

## Communication compatibility

The [OpenCentauri API documentation](https://docs.opencentauri.cc/software/api/) describes the Centauri Carbon SDCP v3 protocol with WebSocket port 3030 and UDP discovery port 3000. The [OpenCentauri project](https://github.com/OpenCentauri) targets Elegoo Centauri Carbon. This does not establish compatibility with Bambu Lab A1 mini firmware. Implement stock A1 mini communication through its Bambu LAN adapter and expose OpenCentauri as a separate supported Centauri adapter.
