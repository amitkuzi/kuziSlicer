import React, { useEffect, useRef, useState } from 'react'
import { PrintSettings, PrintSettingsState } from './PrintSettings'
import { ModelViewer } from './Tabs/ModelViewer'
import { GcodeViewer } from './Tabs/GcodeViewer'
import { PrinterManagement } from './Tabs/PrinterManagement'
import { ModelTransform, IDENTITY_TRANSFORM } from '../utils/viewportTools'
import type { SliceProgress, ConfiguredPrinter } from '../../types/ipc'

const MIN_PANEL_WIDTH = 200
const MAX_PANEL_WIDTH = 560

/** The printer's own web interface, hosted in a tab. Subframes get no preload, so it stays sandboxed from the app. */
const PrinterWebUI: React.FC<{ printer: ConfiguredPrinter }> = ({ printer }) => {
  const [reloadKey, setReloadKey] = useState(0)

  if (!printer.ipAddress || !/^[a-zA-Z0-9.\-]+$/.test(printer.ipAddress)) {
    return (
      <div className="p-6 text-sm text-fg2">
        No usable IP address for <span className="text-fg font-medium">{printer.name}</span>. Set a host or IP
        in Printer Management to open its web interface.
      </div>
    )
  }

  const port = printer.port && printer.port !== '80' ? `:${printer.port}` : ''
  const url = `http://${printer.ipAddress}${port}/`

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center gap-3 border-b border-fg2/10 px-3 py-2">
        <span className="font-mono text-xs text-fg2">{url}</span>
        <button
          onClick={() => setReloadKey((k) => k + 1)}
          className="rounded bg-fg2/10 px-2 py-1 text-xs text-fg hover:bg-fg2/20"
        >
          Reload
        </button>
        <span className="text-xs text-fg2/60">Blank page? This printer may not serve a web interface.</span>
      </div>
      <iframe
        key={reloadKey}
        src={url}
        title={`${printer.name} web interface`}
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-forms allow-same-origin"
        className="w-full flex-1 border-0 bg-white"
      />
    </div>
  )
}

const progressLabel = (p: SliceProgress): string => {
  if (p.phase === 'preparing') return 'Preparing model…'
  if (p.phase === 'external') return 'ElegooSlicer is slicing…'
  if (p.phase === 'slicing') return `Slicing… ${Math.round((p.done / Math.max(1, p.total)) * 100)}%`
  return ''
}

/** Non-blocking banner for work that takes long enough to look like a freeze. */
const BusyBanner: React.FC = () => {
  const [progress, setProgress] = useState<SliceProgress | null>(null)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const listener = (p: unknown) => {
      const next = p as SliceProgress
      setProgress(next.phase === 'idle' ? null : next)
    }
    window.electron.on('job:progress', listener)
    return () => window.electron.off('job:progress', listener)
  }, [])

  const busy = progress !== null
  useEffect(() => {
    if (!busy) {
      setElapsed(0)
      return
    }
    const started = Date.now()
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [busy])

  if (!progress) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg bg-raised px-4 py-3 shadow-2xl border border-ember/40"
    >
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-ember border-t-transparent" />
      <span className="text-sm text-fg">{progressLabel(progress)}</span>
      <span className="text-xs text-fg2 tabular-nums">{elapsed}s</span>
    </div>
  )
}

type Tab = '3d-viewer' | 'gcode-viewer' | 'printer-mgmt' | `printer:${string}`
export type ExperienceMode = 'simple' | 'advanced'

const loadExperienceMode = (): ExperienceMode =>
  localStorage.getItem('experienceMode') === 'advanced' ? 'advanced' : 'simple'

const loadPanelWidth = (): number => {
  const saved = Number(localStorage.getItem('panelWidth'))
  return Number.isFinite(saved) && saved > 0
    ? Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, saved))
    : 256
}

export const MainWindow: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('3d-viewer')
  const [printSettings, setPrintSettings] = useState<PrintSettingsState | null>(null)
  const [gcodeData, setGcodeData] = useState<string>('')
  const [modelPath, setModelPath] = useState<string | null>(null)
  const [openModelSignal, setOpenModelSignal] = useState(0)
  const [modelTransform, setModelTransform] = useState<ModelTransform>(IDENTITY_TRANSFORM)
  const [experienceMode, setExperienceMode] = useState<ExperienceMode>(loadExperienceMode)
  const [panelWidth, setPanelWidth] = useState<number>(loadPanelWidth)
  const [openPrinterIds, setOpenPrinterIds] = useState<string[]>([])
  const [printers, setPrinters] = useState<ConfiguredPrinter[]>([])
  const tabBarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    localStorage.setItem('experienceMode', experienceMode)
  }, [experienceMode])

  useEffect(() => {
    localStorage.setItem('panelWidth', String(panelWidth))
  }, [panelWidth])

  // Never let the sidebar squeeze the viewport out of existence on a small window.
  const clampWidth = (value: number) =>
    Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, window.innerWidth - 320, value))

  // Pointer capture, not window listeners: a drag that crosses the printer iframe would
  // otherwise lose the pointerup to the frame and leave the panel following the mouse.
  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const handle = event.currentTarget
    const grabOffset = event.clientX - panelWidth
    handle.setPointerCapture(event.pointerId)
    const onMove = (e: PointerEvent) => setPanelWidth(clampWidth(e.clientX - grabOffset))
    const stop = () => {
      handle.releasePointerCapture(event.pointerId)
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', stop)
      handle.removeEventListener('pointercancel', stop)
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', stop)
    handle.addEventListener('pointercancel', stop)
  }

  const openPrinterTab = (printer: ConfiguredPrinter) => {
    setOpenPrinterIds((open) => (open.includes(printer.id) ? open : [...open, printer.id]))
    setActiveTab(`printer:${printer.id}`)
  }

  const closePrinterTab = (id: string) => {
    setOpenPrinterIds((open) => open.filter((p) => p !== id))
    setActiveTab((current) => (current === `printer:${id}` ? 'printer-mgmt' : current))
    tabBarRef.current?.focus()
  }

  // Tabs follow the live printer list, so renaming or deleting a printer is reflected here
  // rather than leaving a tab framing a printer that no longer exists.
  const openPrinters = openPrinterIds
    .map((id) => printers.find((p) => p.id === id))
    .filter((p): p is ConfiguredPrinter => !!p)

  const tabs: { id: Tab; label: string; closable?: boolean }[] = [
    { id: '3d-viewer', label: '3D Viewer' },
    { id: 'gcode-viewer', label: 'G-code Viewer' },
    { id: 'printer-mgmt', label: 'Printer Management' },
    ...openPrinters.map((p) => ({ id: `printer:${p.id}` as Tab, label: p.name, closable: true })),
  ]

  return (
    <div className="flex h-screen bg-ground">
      {/* Left Sidebar - Print Settings */}
      <aside
        style={{ width: panelWidth }}
        className="shrink-0 bg-raised border-r border-fg2/10 flex flex-col"
      >
        <PrintSettings
          mode={experienceMode}
          modelPath={modelPath}
          modelTransform={modelTransform}
          onRequestModel={() => {
            setActiveTab('3d-viewer')
            setOpenModelSignal((n) => n + 1)
          }}
          onSettingsChange={setPrintSettings}
          onGenerateGcode={(gcode) => {
            setGcodeData(gcode)
            setActiveTab('gcode-viewer')
          }}
        />
      </aside>

      {/* Sidebar width handle */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize settings panel"
        aria-valuenow={panelWidth}
        aria-valuemin={MIN_PANEL_WIDTH}
        aria-valuemax={MAX_PANEL_WIDTH}
        tabIndex={0}
        onPointerDown={startResize}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setPanelWidth((w) => clampWidth(w - 16))
          if (e.key === 'ArrowRight') setPanelWidth((w) => clampWidth(w + 16))
        }}
        className="w-1 shrink-0 cursor-col-resize bg-fg2/10 hover:bg-ember/60 focus:bg-ember focus:outline-none"
      />

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 flex flex-col">
        {/* Tab Bar */}
        <div className="bg-raised border-b border-fg2/10 flex items-center justify-between pr-3">
          <div ref={tabBarRef} tabIndex={-1} className="flex overflow-x-auto focus:outline-none">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`flex items-center border-b-2 ${
                  activeTab === tab.id ? 'border-ember' : 'border-transparent'
                }`}
              >
                <button
                  onClick={() => setActiveTab(tab.id)}
                  className={`whitespace-nowrap py-3 font-medium text-sm transition-colors ${
                    tab.closable ? 'pl-4 pr-2' : 'px-6'
                  } ${activeTab === tab.id ? 'text-ember' : 'text-fg2 hover:text-fg'}`}
                >
                  {tab.label}
                </button>
                {tab.closable && (
                  <button
                    onClick={() => closePrinterTab(tab.id.slice('printer:'.length))}
                    aria-label={`Close ${tab.label}`}
                    className="pr-3 text-fg2 hover:text-fg"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center rounded-lg bg-ground p-1" aria-label="Settings mode">
            {(['simple', 'advanced'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setExperienceMode(mode)}
                aria-pressed={experienceMode === mode}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  experienceMode === mode ? 'bg-ember text-onEmber' : 'text-fg2 hover:text-fg'
                }`}
              >
                {mode === 'simple' ? 'Simple' : 'Advanced'}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        {/* Tabs stay mounted so the 3D scene (and its WebGL context) survives tab switches */}
        <div className="flex-1 overflow-hidden">
          <div className={`w-full h-full ${activeTab === '3d-viewer' ? '' : 'hidden'}`}>
            <ModelViewer
              onModelLoaded={(path) => setModelPath(path)}
              openDialogSignal={openModelSignal}
              onTransformChange={setModelTransform}
            />
          </div>
          <div className={`w-full h-full ${activeTab === 'gcode-viewer' ? '' : 'hidden'}`}>
            <GcodeViewer gcode={gcodeData} />
          </div>
          <div className={`w-full h-full ${activeTab === 'printer-mgmt' ? '' : 'hidden'}`}>
            <PrinterManagement onOpenPrinter={openPrinterTab} onPrintersChanged={setPrinters} />
          </div>
          {/* Only the visible printer frame is mounted -- background LAN pages keep polling. */}
          {openPrinters
            .filter((printer) => activeTab === `printer:${printer.id}`)
            .map((printer) => (
              <div key={printer.id} className="w-full h-full">
                <PrinterWebUI printer={printer} />
              </div>
            ))}
        </div>
      </main>
      <BusyBanner />
    </div>
  )
}
