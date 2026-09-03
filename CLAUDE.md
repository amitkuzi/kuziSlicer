# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**kuziSlicer** is a desktop application (Electron) for slicing 3D models into G-code for 3D printing. It combines:
- A React UI (Vite-based frontend)
- Electron main process (Node.js backend with IPC)
- STL parsing and G-code generation logic
- Printer and filament profile management

The goal: provide an intuitive, feature-rich slicer with support for multiple printers and materials.

---

## Development Commands

```bash
# Start development (concurrent Vite dev server + Electron in dev mode)
npm run dev

# Build everything (Vite + esbuild main/preload)
npm run build

# Run production build
npm start

# Package for Windows (NSIS installer + portable)
npm run dist

# Fast build without packaging
npm run pack

# Individual builds
npm run build:vite         # React UI only (Vite)
npm run build:main         # Electron main process
npm run build:main:entry   # Main process entry point (src/main/main.ts)
npm run build:main:preload # Preload script (src/main/preload.ts)
```

---

## Architecture

### Two-Process Model

**Main Process** (`src/main/main.ts`):
- Window lifecycle, IPC handlers
- File I/O, printer connections
- Stores user data in `app.getPath('userData')`

**Renderer Process** (`src/renderer/`):
- React components, UI state
- Communicates with main via typed IPC channels
- Vite-bundled, hot-reload in dev

**Preload** (`src/main/preload.ts`):
- Type-safe IPC wrapper
- Exposes only necessary Electron APIs

### Directory Structure

```
src/
├── main/                      # Electron main process
│   ├── main.ts               # Window setup, IPC event handlers
│   ├── preload.ts            # Safe IPC bridge to renderer
│   └── services/
│       ├── gcodeGenerator.ts # STL parsing, G-code output
│       └── profilesManager.ts # Printer/filament profile I/O
├── renderer/                  # React frontend
│   ├── index.tsx             # React entry, ReactDOM mount
│   ├── App.tsx               # Root component (splash → main window)
│   ├── index.css             # Global styles (Tailwind imports)
│   ├── components/
│   │   ├── MainWindow.tsx    # Tabbed UI root
│   │   ├── PrintSettings.tsx # Settings panel
│   │   ├── SplashScreen.tsx  # Startup splash
│   │   └── Tabs/
│   │       ├── ModelViewer.tsx    # 3D model preview (Three.js)
│   │       ├── PrinterManagement.tsx  # Printer management
│   │       └── GcodeViewer.tsx   # G-code preview
│   └── utils/
│       └── profilesApi.ts    # IPC calls for profiles
├── types/
│   └── ipc.ts               # Typed IPC channel interfaces
├── data/                     # Bundled defaults
│   ├── printers.json        # Default printer profiles
│   └── filaments.json       # Default filament profiles
└── splash/
    └── splashScreen.ts      # Splash screen logic
```

### Key Files & Patterns

**IPC Type Safety** (`src/types/ipc.ts`):
- `InvokeChannels`: async request-response (promise-based)
- `SendChannels`: fire-and-forget
- `EventChannels`: event listeners
- All channels defined here; use this as the API contract

**G-code Generation** (`src/main/services/gcodeGenerator.ts`):
- `StlParser`: parses ASCII/binary STL → triangles + bounds
- `GcodeGenerator`: orchestrates slicing, generates G-code
- Interfaces: `PrinterProfile`, `FilamentProfile`, `PrintSettings`

**Profile Management** (`src/main/services/profilesManager.ts`):
- Load/save printer and filament profiles
- Support for JSON and YAML
- Import/export via GitHub, URL, local file

---

## Development Workflow

### Adding a Feature

1. **Renderer (React)**: Add component or update UI state
2. **IPC contract** (`src/types/ipc.ts`): Add new channel if needed
3. **Main process** (`src/main/main.ts`): Wire up IPC handler
4. **Service** (`src/main/services/*`): Implement business logic
5. **Test in dev**: `npm run dev` opens Electron with hot-reload

### Common Tasks

**Adding a new IPC channel:**
1. Define in `src/types/ipc.ts` (add to `InvokeChannels` or `SendChannels`)
2. Add handler in `src/main/main.ts` via `ipcMain.handle(...)` or `ipcMain.on(...)`
3. Call from renderer via `window.electron.ipc.invoke(...)` (available in preload)

**Modifying printer/filament profiles:**
- Edit `src/data/printers.json` or `src/data/filaments.json`
- Update `gcodeGenerator.ts` interfaces if schema changes
- ProfilesManager merges bundled + user profiles on load

**3D model preview (Three.js):**
- `src/renderer/components/Tabs/ModelViewer.tsx`
- Renders STL via Three.js
- Calls `gcode:generate` IPC to send model to main process for slicing

---

## Build & Packaging

### Development Build
```bash
npm run dev
```
- Vite server at `http://localhost:3000`
- Electron auto-reloads on preload/main changes (manual reload for Vite changes)

### Production Build
```bash
npm run build
```
- Compiles React to `dist/` (Vite)
- Bundles Electron main/preload via esbuild
- Output: `dist/main.js`, `dist/preload.js`, `dist/index.html`, `dist/assets/`

### Distribute
```bash
npm run dist
```
- Runs `build`, then electron-builder
- Creates Windows installer + portable EXE
- Output: `dist/` directory with `kuziSlicer Setup.exe`, `kuziSlicer.exe`

### Configuration
- **Vite**: `vite.config.ts` (React plugin, port 3000)
- **esbuild**: Commands in `package.json` (bundles Node.js entry points)
- **electron-builder**: `package.json` `build` field (Windows NSIS + portable)

---

## Key Patterns

### IPC Communication (Type-Safe)

**From Renderer:**
```typescript
// Async call with return value
const printers = await window.electron.ipc.invoke('gcode:printers')

// Fire-and-forget
window.electron.ipc.send('app:close')

// Listen for events
window.electron.ipc.on('printer:connected', (printer) => { ... })
```

**In Main Process:**
```typescript
ipcMain.handle('gcode:printers', () => {
  return loadPrinterProfiles()
})

ipcMain.on('app:close', () => {
  app.quit()
})

mainWindow.webContents.send('printer:connected', printer)
```

### Service Layer Pattern

- Services in `src/main/services/*` contain business logic
- Main process imports and calls services
- Services read/write to `app.getPath('userData')` for persistence
- Keep services independent (no Electron/IPC coupling)

### Component State in React

- Use `useState` for local UI state
- Call IPC via `useEffect` to fetch data on mount
- Debounce/throttle IPC calls if needed
- No Redux/Zustand required for current feature scope

---

## Debugging

### Dev Mode Logging

In main process:
```typescript
console.log('Main process message:', data)
```

In renderer:
```typescript
console.log('Renderer message:', data)
```

Both visible in dev console (Ctrl+Shift+I in Electron window).

### IPC Debugging

- Print call/response in preload for visibility
- Add logging in `src/main/main.ts` handlers
- Use Electron DevTools (F12) to inspect network/console

---

## Dependencies & Versions

| Dependency | Version | Purpose |
|---|---|---|
| Electron | 27.0.0 | Desktop framework |
| React | 18.2.0 | UI library |
| Three.js | 0.185.1 | 3D rendering |
| Vite | 5.0.0 | Frontend bundler |
| esbuild | 0.19.0 | Main process bundler |
| Tailwind CSS | 3.3.0 | Styling |
| TypeScript | 5.1.0 | Language |

**No breaking version changes without testing full dev workflow.**

---

## AI Toolbox Integration

**Profile**: `kuziSlicer-dev`  
**Routing**: Use `/toolbox:route --profile kuziSlicer-dev "task"` for intelligent tool selection.

### Task Routing Guide

| Task Type | Tier | Example |
|---|---|---|
| **STL parsing, geometry math** | T0 | Parse triangles, detect non-manifold, wall thickness |
| **Simple code (UI, settings, basic features)** | T1 | Webview UI, config dialog, export formats |
| **Complex code (API integration, optimization)** | T2 | Printer API, performance tuning, translation |

**DO use AI Toolbox for:**
- Algorithm design (layer height, infill patterns)
- UI/UX code generation
- Printer integration (APIs, firmware quirks)

**DON'T use AI Toolbox for:**
- STL file parsing (pure deterministic math; use local Python/numpy)
- Mesh geometry (local tools only)

---

## Common Pitfalls

1. **IPC type mismatch**: Ensure `src/types/ipc.ts` matches actual handlers
2. **Missing preload export**: New Electron APIs must be explicitly exposed in `src/main/preload.ts`
3. **Dev mode confusion**: Vite hot-reload works for React; main process requires manual restart
4. **Profile paths**: Always use `app.getPath('userData')` for user data, never hardcode paths
5. **STL parsing**: Binary format can be tricky; test with real files, not test fixtures

---

## Git Conventions

- Use semantic commit prefixes: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`
- Branch names: `feature/description` or `fix/issue-name`
- Keep commits atomic; rebase before merge

---

## Next Steps for Future Development

- [ ] Add support for multi-material printing
- [ ] Integrate OctoPrint/Moonraker APIs for printer control
- [ ] Implement adaptive slicing algorithms
- [ ] Build native mesh repair tools
- [ ] Add support for more file formats (3MF, STEP)
- [ ] Performance optimization for large STL files (>100MB)

---

## References

- **Electron Docs**: https://www.electronjs.org/docs
- **IPC Patterns**: See `src/types/ipc.ts` for all channels
- **G-code Format**: RepRap wiki (https://reprap.org/wiki/G-code)
- **Printer Profiles**: Defaults in `src/data/printers.json`
- **AI Toolbox**: See `DEPLOYMENT-GUIDE.md` and `QUICK-REFERENCE.md`
