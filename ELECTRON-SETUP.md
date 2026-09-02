# kuziSlicer Electron Setup (Subtask S1)

## Project Structure

```
kuziSlicer/
├── src/
│   ├── main/
│   │   ├── main.ts              # Electron main process
│   │   └── preload.ts           # IPC bridge (secure context)
│   ├── renderer/
│   │   ├── index.tsx            # React entry point
│   │   ├── App.tsx              # Main component (splash + main window)
│   │   ├── index.css            # Global styles (Tailwind)
│   │   └── components/
│   │       ├── SplashScreen.tsx # 2s startup splash
│   │       └── MainWindow.tsx   # Main layout (tabs + sidebar)
│   ├── types/
│   │   └── ipc.ts               # IPC channel types
│   └── splash/                  # (old, can be removed)
├── public/
│   └── index.html               # Vite/Electron entry HTML
├── dist/                        # Build output
├── package.json                 # Scripts & dependencies
├── tsconfig.json                # TypeScript config
├── vite.config.ts               # React dev server + build
├── tailwind.config.js           # Tailwind with brandkit colors
└── postcss.config.js            # PostCSS for Tailwind
```

## Development

```bash
npm install

# Run dev server + Electron (HMR enabled)
npm run dev

# Or separately:
npm run dev:vite     # Vite on http://localhost:3000
npm run dev:electron # Electron (connects to dev server)
```

## Build & Package

```bash
# Build for production
npm run build

# Create installers
npm run dist
```

## Architecture

### Main Process (Electron)
- `src/main/main.ts`: Creates BrowserWindow, loads React app
- Dev: Points to `http://localhost:3000` (Vite dev server)
- Prod: Points to `file://{dist}/index.html` (bundled build)

### Renderer Process (React)
- `src/renderer/App.tsx`: Main component
  - Shows `SplashScreen` for 2 seconds on startup
  - Reveals `MainWindow` (tabs + sidebar layout)
- `SplashScreen`: Brandkit logo + progress bar (ember color)
- `MainWindow`: 
  - Left sidebar: Print Settings (3 placeholder cards)
  - Main area: Tabs for 3D Viewer, G-code Viewer, Printer Mgmt
  - Tab content: Placeholder for S2-S6 subtasks

### IPC Bridge (preload.ts)
Context-isolated IPC with whitelisted channels:
- **Async** (`invoke`): printer:list, file:open, gcode:send, settings:get/set
- **Send**: app:minimize, app:maximize, app:close
- **Events**: printer:connected, printer:disconnected, app:update

Securely exposed via `window.electron.*` in renderer.

## Styling

- **Framework**: Tailwind CSS
- **Colors**: Brandkit palette (ember #E4632D, ground #F4EFE7, etc.)
- **Animations**: Fade-in/out on splash screen

## Next Steps (S2-S6)

Each subtask adds to the placeholders:
- S2: 3D Viewer component (Three.js integration)
- S3: G-code generator + preview
- S4: Printer management UI
- S5: Settings panel (left sidebar)
- S6: G-code viewer component

All use the IPC bridge in `preload.ts` for safe main↔renderer communication.
