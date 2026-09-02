import React, { useState, useEffect } from 'react'

export interface PrintSettingsState {
  modelName: string
  printer: string
  filament: string
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
  layerHeight: 0.2,
  infillPercentage: 20,
  supportEnabled: false,
  extruderTemp: 200,
  bedTemp: 60,
  printSpeed: 50,
  travelSpeed: 150,
}

const FILAMENTS = [
  { id: 'pla', name: 'PLA', extruderTemp: 200, bedTemp: 60 },
  { id: 'petg', name: 'PETG', extruderTemp: 230, bedTemp: 80 },
  { id: 'abs', name: 'ABS', extruderTemp: 240, bedTemp: 100 },
  { id: 'nylon', name: 'Nylon', extruderTemp: 250, bedTemp: 85 },
]

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
  onSettingsChange?: (settings: PrintSettingsState) => void
  onGenerateGcode?: (settings: PrintSettingsState) => void
}

export const PrintSettings: React.FC<PrintSettingsProps> = ({
  onSettingsChange,
  onGenerateGcode,
}) => {
  const [settings, setSettings] = useState<PrintSettingsState>(DEFAULT_SETTINGS)
  const [printers, setPrinters] = useState<Array<{ id: string; name: string }>>([])
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

  // Fetch available printers
  useEffect(() => {
    const fetchPrinters = async () => {
      try {
        const result = (await window.electron.invoke('printer:list')) as Array<{
          id: string
          name: string
        }>
        setPrinters(result || [])
      } catch (e) {
        console.error('Failed to fetch printers:', e)
      }
    }
    fetchPrinters()
  }, [])

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
    const filament = FILAMENTS.find((f) => f.id === filamentId)
    handleSettingChange('filament', filamentId)
    if (filament) {
      handleSettingChange('extruderTemp', filament.extruderTemp)
      handleSettingChange('bedTemp', filament.bedTemp)
    }
  }

  const handleGenerateGcode = async () => {
    try {
      // Invoke gcode generation
      await window.electron.invoke('gcode:generate', settings)
      onGenerateGcode?.(settings)
    } catch (e) {
      console.error('Failed to generate G-code:', e)
      alert('Error generating G-code. Please check the console.')
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
        <h2 className="text-lg font-bold text-fg">Print Settings</h2>
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
            <input
              type="text"
              value={settings.modelName}
              onChange={(e) => handleSettingChange('modelName', e.target.value)}
              placeholder="Loaded model name..."
              className="px-3 py-2 text-sm border border-fg2/20 rounded bg-raised text-fg focus:outline-none focus:border-ember"
            />
          </FormField>
          <button className="w-full px-3 py-2 text-sm bg-ember hover:bg-ember/90 text-onEmber rounded font-medium transition-colors">
            Load New Model
          </button>
        </CollapsibleSection>

        {/* Printer & Filament */}
        <CollapsibleSection
          title="Printer & Filament"
          isOpen={expandedSections.printer}
          onToggle={() => toggleSection('printer')}
        >
          <FormField label="Printer">
            <select
              value={settings.printer}
              onChange={(e) => handleSettingChange('printer', e.target.value)}
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
          <FormField label="Filament">
            <select
              value={settings.filament}
              onChange={(e) => handleFilamentChange(e.target.value)}
              className="px-3 py-2 text-sm border border-fg2/20 rounded bg-raised text-fg focus:outline-none focus:border-ember cursor-pointer"
            >
              <option value="">Select filament...</option>
              {FILAMENTS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </FormField>
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

        {/* Temperatures */}
        <CollapsibleSection
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
        </CollapsibleSection>

        {/* Speed */}
        <CollapsibleSection
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
        </CollapsibleSection>
      </div>

      {/* Action Buttons */}
      <div className="p-4 border-t border-fg2/10 space-y-2">
        <button
          onClick={handleGenerateGcode}
          className="w-full px-4 py-3 bg-ember hover:bg-ember/90 text-onEmber rounded font-semibold text-sm transition-colors"
        >
          Generate G-code
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
