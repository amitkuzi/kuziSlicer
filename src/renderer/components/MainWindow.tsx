import React, { useEffect, useState } from 'react'
import { PrintSettings, PrintSettingsState } from './PrintSettings'
import { ModelViewer } from './Tabs/ModelViewer'
import { GcodeViewer } from './Tabs/GcodeViewer'
import { PrinterManagement } from './Tabs/PrinterManagement'

type Tab = '3d-viewer' | 'gcode-viewer' | 'printer-mgmt'
export type ExperienceMode = 'simple' | 'advanced'

const loadExperienceMode = (): ExperienceMode =>
  localStorage.getItem('experienceMode') === 'advanced' ? 'advanced' : 'simple'

export const MainWindow: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('3d-viewer')
  const [printSettings, setPrintSettings] = useState<PrintSettingsState | null>(null)
  const [gcodeData, setGcodeData] = useState<string>('')
  const [modelPath, setModelPath] = useState<string | null>(null)
  const [experienceMode, setExperienceMode] = useState<ExperienceMode>(loadExperienceMode)

  useEffect(() => {
    localStorage.setItem('experienceMode', experienceMode)
  }, [experienceMode])

  const tabs: { id: Tab; label: string }[] = [
    { id: '3d-viewer', label: '3D Viewer' },
    { id: 'gcode-viewer', label: 'G-code Viewer' },
    { id: 'printer-mgmt', label: 'Printer Management' },
  ]

  return (
    <div className="flex h-screen bg-ground">
      {/* Left Sidebar - Print Settings */}
      <aside className="w-64 bg-raised border-r border-fg2/10 flex flex-col">
        <PrintSettings
          mode={experienceMode}
          modelPath={modelPath}
          onRequestModel={() => setActiveTab('3d-viewer')}
          onSettingsChange={setPrintSettings}
          onGenerateGcode={(gcode) => {
            setGcodeData(gcode)
            setActiveTab('gcode-viewer')
          }}
        />
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col">
        {/* Tab Bar */}
        <div className="bg-raised border-b border-fg2/10 flex items-center justify-between pr-3">
          <div className="flex">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 ${
                  activeTab === tab.id
                    ? 'text-ember border-ember'
                    : 'text-fg2 border-transparent hover:text-fg'
                }`}
              >
                {tab.label}
              </button>
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
        <div className="flex-1 overflow-hidden">
          {activeTab === '3d-viewer' && (
            <ModelViewer onModelLoaded={(path) => setModelPath(path)} />
          )}
          {activeTab === 'gcode-viewer' && <GcodeViewer gcode={gcodeData} />}
          {activeTab === 'printer-mgmt' && <PrinterManagement />}
        </div>
      </main>
    </div>
  )
}
