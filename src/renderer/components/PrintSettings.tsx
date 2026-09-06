import React, { useState, useEffect } from 'react'
import { PrinterProfile, FilamentProfile } from '../../types/ipc'
import type { ExperienceMode } from './MainWindow'

export interface PrintSettingsState {
  modelName: string
  printer: string
  filament: string
  nozzleSize: number
  layerHeight: number
  infillPercentage: number
  supportEnabled: boolean
  extruderTemp: number
  bedTemp: number
  printSpeed: number
  travelSpeed: number
}

const DEFAULT_SETTINGS: PrintSettingsState = {
  modelName: '',
  printer: '',
  filament: '',
  nozzleSize: 0.4,
  layerHeight: 0.2,
  infillPercentage: 20,
  supportEnabled: false,
  extruderTemp: 200,
  bedTemp: 60,
  printSpeed: 50,
  travelSpeed: 150,
}

const NOZZLE_SIZES = [0.4, 0.6]

interface SectionProps {
  title: string
  children: React.ReactNode
  isOpen: boolean
  onToggle: () => void
}

const CollapsibleSection: React.FC<SectionProps> = ({ title, children, isOpen, onToggle }) => (
  <div className="border border-fg2/20 rounded overflow-hidden">
    <button
      onClick={onToggle}
      className="w-full px-4 py-3 bg-raised hover:bg-ground transition-colors flex items-center justify-between"
    >
      <h3 className="font-semibold text-fg text-sm">{title}</h3>
      <span className={`text-fg2 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
        ▼
      </span>
    </button>
    {isOpen && <div className="p-4 bg-ground/50 space-y-3">{children}</div>}
  </div>
)

interface FormFieldProps {
  label: string
  children: React.ReactNode
}

const FormField: React.FC<FormFieldProps> = ({ label, children }) => (
  <div className="flex flex-col gap-1">
    <label className="text-xs font-medium text-fg2">{label}</label>
    {children}
  </div>
)

export interface PrintSettingsProps {
  mode: ExperienceMode
  modelPath?: string | null
  onRequestModel?: () => void
  onSettingsChange?: (settings: PrintSettingsState) => void
  onGenerateGcode?: (gcode: string) => void
}

export const PrintSettings: React.FC<PrintSettingsProps> = ({
  mode,
  modelPath,
  onRequestModel,
  onSettingsChange,
  onGenerateGcode,
}) => {
  const [settings, setSettings] = useState<PrintSettingsState>(DEFAULT_SETTINGS)
  const [printers, setPrinters] = useState<PrinterProfile[]>([])
  const [filaments, setFilaments] = useState<FilamentProfile[]>([])
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    model: true,
    printer: true,
    quality: true,
    temperature: false,
    speed: false,
  })

  // Load settings from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('printSettings')
    if (saved) {
      try {
        const loaded = JSON.parse(saved)
        setSettings({ ...DEFAULT_SETTINGS, ...loaded })
      } catch (e) {
        console.error('Failed to load settings:', e)
      }
    }
  }, [])

  // Fetch available printer + filament profiles (bundled + user-imported)
  const refreshProfiles = async () => {
    try {
      const [printerList, filamentList] = await Promise.all([
        window.electron.invoke('gcode:printers') as Promise<PrinterProfile[]>,
        window.electron.invoke('gcode:filaments') as Promise<FilamentProfile[]>,
      ])
      setPrinters(printerList || [])
      setFilaments(filamentList || [])
    } catch (e) {
      console.error('Failed to fetch profiles:', e)
    }
  }

  useEffect(() => {
    refreshProfiles()
  }, [])

  const handlePrinterChange = (printerId: string) => {
    handleSettingChange('printer', printerId)
    const printer = printers.find((p) => p.id === printerId)
    if (printer) {
      handleSettingChange('nozzleSize', printer.nozzleSize)
    }
  }

  const handleImportProfiles = async () => {
    if (!importUrl.trim()) return
    setImporting(true)
    setImportMessage(null)
    try {
      const isGithub = importUrl.includes('github.com')
      let result: { success: boolean; printers?: PrinterProfile[]; filaments?: FilamentProfile[]; error?: string }
      if (isGithub) {
        const match = importUrl.match(/github\.com\/([^/]+)\/([^/]+)(?:\/(?:blob|tree)\/([^/]+)\/(.+))?/)
        if (!match) throw new Error('Could not parse GitHub URL')
        const [, owner, repo, branch, filePath] = match
        result = (await window.electron.invoke(
          'profiles:import-github',
          owner,
          repo,
          branch || 'main',
          filePath || 'profiles.yaml'
        )) as typeof result
      } else {
        result = (await window.electron.invoke('profiles:import-url', importUrl)) as typeof result
      }

      if (!result.success) throw new Error(result.error || 'Import failed')

      const merged = (await window.electron.invoke('profiles:merge', {
        printers: result.printers || [],
        filaments: result.filaments || [],
      }, false)) as { success: boolean; printers?: PrinterProfile[]; filaments?: FilamentProfile[]; error?: string }

      if (!merged.success) throw new Error(merged.error || 'Merge failed')

      setImportMessage(
        `Imported ${result.printers?.length || 0} printer(s), ${result.filaments?.length || 0} filament(s).`
      )
      await refreshProfiles()
      setImportUrl('')
    } catch (e) {
      setImportMessage(`Import failed: ${String(e)}`)
    } finally {
      setImporting(false)
    }
  }

  // Save settings to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('printSettings', JSON.stringify(settings))
    onSettingsChange?.(settings)
  }, [settings, onSettingsChange])

  const handleSettingChange = <K extends keyof PrintSettingsState>(
    key: K,
    value: PrintSettingsState[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  const handleFilamentChange = (filamentId: string) => {
    const filament = filaments.find((f) => f.id === filamentId)
    handleSettingChange('filament', filamentId)
    if (filament) {
      handleSettingChange('extruderTemp', filament.extruderTemp)
      handleSettingChange('bedTemp', filament.bedTemp)
      handleSettingChange('printSpeed', filament.printSpeed)
    }
  }

  const [generating, setGenerating] = useState(false)

  // Reflect the loaded model's path into the (otherwise free-text) model name field
  useEffect(() => {
    if (modelPath) {
      handleSettingChange('modelName', modelPath.split(/[\\/]/).pop() || modelPath)
    }
  }, [modelPath])

  const handleGenerateGcode = async () => {
    if (!modelPath) {
      alert('Load a model via a full path first (Browse… or paste a path in the 3D Viewer) -- G-code generation needs a file on disk, not just a preview.')
      return
    }
    if (!modelPath.toLowerCase().endsWith('.stl')) {
      alert('G-code generation currently only supports .stl models.')
      return
    }
    const printer = printers.find((p) => p.id === settings.printer)
    const filament = filaments.find((f) => f.id === settings.filament)
    if (!printer) {
      alert('Select a printer first.')
      return
    }
    if (!filament) {
      alert('Select a filament first.')
      return
    }

    setGenerating(true)
    try {
      // gcode:generate writes the result to a temp file and returns its path
      // (avoids marshaling a potentially huge string over IPC) -- read it back.
      const gcodeFilePath = (await window.electron.invoke(
        'gcode:generate',
        modelPath,
        printer.name,
        filament.name,
        {
          layerHeight: settings.layerHeight,
          infillDensity: settings.infillPercentage,
          shellThickness: printer.nozzleSize * 3,
          supportEnabled: settings.supportEnabled,
          fanSpeed: 100,
        }
      )) as string
      const read = (await window.electron.invoke('file:read', gcodeFilePath)) as {
        success: boolean
        content?: string
        error?: string
      }
      if (!read.success || read.content === undefined) {
        throw new Error(read.error || `Could not read generated G-code from ${gcodeFilePath}`)
      }
      onGenerateGcode?.(read.content)
    } catch (e) {
      console.error('Failed to generate G-code:', e)
      alert(`Error generating G-code: ${String(e)}`)
    } finally {
      setGenerating(false)
    }
  }

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS)
  }

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }))
  }

  return (
    <div className="w-full h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-fg2/10">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-fg">Print Settings</h2>
          <span className="rounded-full bg-ember/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-ember">
            {mode}
          </span>
        </div>
        <p className="mt-1 text-xs text-fg2">
          {mode === 'simple' ? 'Essential controls for a reliable first slice.' : 'Full control over profiles, temperatures and speed.'}
        </p>
      </div>

      {/* Settings Sections */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Model Selection */}
        <CollapsibleSection
          title="Model"
          isOpen={expandedSections.model}
          onToggle={() => toggleSection('model')}
        >
          <FormField label="Select Model">
            {mode === 'advanced' ? (
              <input
                type="text"
                value={settings.modelName}
                onChange={(e) => handleSettingChange('modelName', e.target.value)}
                placeholder="Loaded model name..."
                className="px-3 py-2 text-sm border border-fg2/20 rounded bg-raised text-fg focus:outline-none focus:border-ember"
              />
            ) : (
              <p className="truncate rounded bg-raised px-3 py-2 text-sm text-fg">
                {settings.modelName || 'No model loaded'}
              </p>
            )}
          </FormField>
          <button
            onClick={onRequestModel}
            className="w-full px-3 py-2 text-sm bg-ember hover:bg-ember/90 text-onEmber rounded font-medium transition-colors"
          >
            {modelPath ? 'Change Model' : 'Load Model'}
          </button>
        </CollapsibleSection>

        {/* Printer & Filament */}
        <CollapsibleSection
          title="Printer & Filament"
          isOpen={expandedSections.printer}
          onToggle={() => toggleSection('printer')}
        >
          <FormField label={`Printer (${printers.length} available)`}>
            <select
              value={settings.printer}
              onChange={(e) => handlePrinterChange(e.target.value)}
              className="px-3 py-2 text-sm border border-fg2/20 rounded bg-raised text-fg focus:outline-none focus:border-ember cursor-pointer"
            >
              <option value="">Select a printer...</option>
              {printers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </FormField>
          {mode === 'advanced' && <FormField label="Nozzle Size">
            <select
              value={settings.nozzleSize}
              onChange={(e) => handleSettingChange('nozzleSize', parseFloat(e.target.value))}
              className="px-3 py-2 text-sm border border-fg2/20 rounded bg-raised text-fg focus:outline-none focus:border-ember cursor-pointer"
            >
              {NOZZLE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}mm
                </option>
              ))}
            </select>
          </FormField>}
          <FormField label={`Filament (${filaments.length} available)`}>
            <select
              value={settings.filament}
              onChange={(e) => handleFilamentChange(e.target.value)}
              className="px-3 py-2 text-sm border border-fg2/20 rounded bg-raised text-fg focus:outline-none focus:border-ember cursor-pointer"
            >
              <option value="">Select filament...</option>
              {filaments.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </FormField>
          {mode === 'advanced' && <FormField label="Import Profiles (URL or GitHub link)">
            <div className="flex gap-1">
              <input
                type="text"
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                placeholder="https://... profiles.yaml"
                className="flex-1 px-3 py-2 text-sm border border-fg2/20 rounded bg-raised text-fg focus:outline-none focus:border-ember"
              />
              <button
                onClick={handleImportProfiles}
                disabled={importing || !importUrl.trim()}
                className="px-3 py-2 text-sm bg-fg2/10 text-fg rounded hover:bg-fg2/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing ? 'Importing…' : 'Import'}
              </button>
            </div>
            {importMessage && <p className="text-xs text-fg2 mt-1">{importMessage}</p>}
          </FormField>}
        </CollapsibleSection>

        {/* Quality Settings */}
        <CollapsibleSection
          title="Quality"
          isOpen={expandedSections.quality}
          onToggle={() => toggleSection('quality')}
        >
          <FormField label={`Layer Height: ${settings.layerHeight}mm`}>
            <input
              type="range"
              min="0.1"
              max="0.4"
              step="0.05"
              value={settings.layerHeight}
              onChange={(e) => handleSettingChange('layerHeight', parseFloat(e.target.value))}
              className="w-full h-2 bg-fg2/20 rounded appearance-none cursor-pointer accent-ember"
            />
            <div className="flex gap-2 text-xs text-fg2">
              <span>0.1mm</span>
              <span className="flex-1"></span>
              <span>0.4mm</span>
            </div>
          </FormField>
          <FormField label={`Infill: ${settings.infillPercentage}%`}>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={settings.infillPercentage}
              onChange={(e) => handleSettingChange('infillPercentage', parseInt(e.target.value))}
              className="w-full h-2 bg-fg2/20 rounded appearance-none cursor-pointer accent-ember"
            />
            <div className="flex gap-2 text-xs text-fg2">
              <span>0%</span>
              <span className="flex-1"></span>
              <span>100%</span>
            </div>
          </FormField>
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-fg2">Supports</label>
            <button
              onClick={() => handleSettingChange('supportEnabled', !settings.supportEnabled)}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                settings.supportEnabled ? 'bg-ember' : 'bg-fg2/20'
              }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  settings.supportEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </CollapsibleSection>

        {/* Advanced controls */}
        {mode === 'advanced' && <CollapsibleSection
          title="Temperature"
          isOpen={expandedSections.temperature}
          onToggle={() => toggleSection('temperature')}
        >
          <FormField label="Extruder Temp (°C)">
            <input
              type="number"
              min="150"
              max="300"
              value={settings.extruderTemp}
              onChange={(e) => handleSettingChange('extruderTemp', parseInt(e.target.value))}
              className="px-3 py-2 text-sm border border-fg2/20 rounded bg-raised text-fg focus:outline-none focus:border-ember"
            />
          </FormField>
          <FormField label="Bed Temp (°C)">
            <input
              type="number"
              min="20"
              max="120"
              value={settings.bedTemp}
              onChange={(e) => handleSettingChange('bedTemp', parseInt(e.target.value))}
              className="px-3 py-2 text-sm border border-fg2/20 rounded bg-raised text-fg focus:outline-none focus:border-ember"
            />
          </FormField>
        </CollapsibleSection>}

        {/* Speed */}
        {mode === 'advanced' && <CollapsibleSection
          title="Speed"
          isOpen={expandedSections.speed}
          onToggle={() => toggleSection('speed')}
        >
          <FormField label={`Print Speed: ${settings.printSpeed} mm/s`}>
            <input
              type="range"
              min="20"
              max="100"
              step="5"
              value={settings.printSpeed}
              onChange={(e) => handleSettingChange('printSpeed', parseInt(e.target.value))}
              className="w-full h-2 bg-fg2/20 rounded appearance-none cursor-pointer accent-ember"
            />
            <div className="flex gap-2 text-xs text-fg2">
              <span>20 mm/s</span>
              <span className="flex-1"></span>
              <span>100 mm/s</span>
            </div>
          </FormField>
          <FormField label={`Travel Speed: ${settings.travelSpeed} mm/s`}>
            <input
              type="range"
              min="100"
              max="200"
              step="10"
              value={settings.travelSpeed}
              onChange={(e) => handleSettingChange('travelSpeed', parseInt(e.target.value))}
              className="w-full h-2 bg-fg2/20 rounded appearance-none cursor-pointer accent-ember"
            />
            <div className="flex gap-2 text-xs text-fg2">
              <span>100 mm/s</span>
              <span className="flex-1"></span>
              <span>200 mm/s</span>
            </div>
          </FormField>
        </CollapsibleSection>}
      </div>

      {/* Action Buttons */}
      <div className="p-4 border-t border-fg2/10 space-y-2">
        {!modelPath && (
          <p className="text-xs text-fg2">
            Load a model by full path (3D Viewer tab) to enable G-code generation.
          </p>
        )}
        <button
          onClick={handleGenerateGcode}
          disabled={generating || !modelPath}
          className="w-full px-4 py-3 bg-ember hover:bg-ember/90 text-onEmber rounded font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generating ? 'Generating…' : 'Generate G-code'}
        </button>
        <button
          onClick={handleReset}
          className="w-full px-4 py-2 bg-fg2/10 hover:bg-fg2/20 text-fg rounded font-medium text-sm transition-colors"
        >
          Reset Settings
        </button>
      </div>
    </div>
  )
}
