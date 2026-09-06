# Simple / Advanced mode test plan

## Happy path

| Case | Level | Expected |
|---|---|---|
| First launch with no saved mode | UI integration | Simple is selected and only essential slicing controls are visible. |
| Select Advanced | UI integration | Nozzle, profile import, temperature, and speed controls become visible. |
| Reload after selecting Advanced | UI integration | Advanced remains selected from local storage. |
| Select Load/Change Model from another tab | UI integration | The 3D Viewer becomes active and exposes model loading controls. |
| Generate with a valid STL and profiles | End-to-end | The shared slicing pipeline produces G-code and opens the G-code Viewer. |

## Validation and edge cases

| Case | Level | Expected |
|---|---|---|
| Saved mode contains an unknown value | Unit/UI | The app falls back to Simple. |
| Switch modes after editing settings | UI integration | The same settings state is retained; modes only change visibility. |
| No model is loaded | UI integration | Generate G-code stays disabled in both modes. |
| Profiles cannot be loaded | UI integration | The mode switch and model navigation remain usable; profile errors are surfaced by the existing UI. |

## Regression gates

- `npm run build`
- `npm run test:gcodepipeline`
- `npm run test:gcodevalidation`
- `npm run test:overrideengine`
- `npm run test:pluginmanager`
- `npm run test:printerextensions`
- Browser smoke test at the Vite development URL for Simple, Advanced, reload persistence, and model navigation.
- Production Electron startup smoke test; stop without dispatching a print.
