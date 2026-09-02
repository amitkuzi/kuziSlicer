import React, { useState } from 'react'
import { PrintSettings, PrintSettingsState } from './PrintSettings'
import { ModelViewer } from './Tabs/ModelViewer'
import { GcodeViewer } from './Tabs/GcodeViewer'
import { PrinterManagement } from './Tabs/PrinterManagement'

type Tab = '3d-viewer' | 'gcode-viewer' | 'printer-mgmt'

export const MainWindow: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('3d-viewer')
  const [printSettings, setPrintSettings] = useState<PrintSettingsState | null>(null)
  const [gcodeData, setGcodeData] = useState<string>('')

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
          onSettingsChange={setPrintSettings}
          onGenerateGcode={(settings) => console.log('Generate G-code:', settings)}
        />
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col">
        {/* Tab Bar */}
        <div className="bg-raised border-b border-fg2/10 flex">
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

        {/* Tab Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === '3d-viewer' && <ModelViewer />}
          {activeTab === 'gcode-viewer' && <GcodeViewer gcode={gcodeData} />}
          {activeTab === 'printer-mgmt' && <PrinterManagement />}
        </div>
      </main>
    </div>
  )
}
