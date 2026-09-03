import React, { useEffect, useState } from 'react'

interface ConfigWizardProps {
  onComplete: () => void
}

interface PrinterModel {
  id: string
  name: string
}

export const ConfigWizard: React.FC<ConfigWizardProps> = ({ onComplete }) => {
  const [models, setModels] = useState<PrinterModel[]>([])
  const [name, setName] = useState('My Printer')
  const [model, setModel] = useState('')
  const [ipAddress, setIpAddress] = useState('')
  const [port, setPort] = useState('5000')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const loadModels = async () => {
      try {
        const response = await fetch('./printers.json')
        const data = await response.json()
        const list = data.printers.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }))
        setModels(list)
        if (list.length > 0) setModel(list[0].id)
      } catch (err) {
        console.error('Error loading printer models:', err)
      }
    }
    loadModels()
  }, [])

  const handleSkip = async () => {
    try {
      await window.electron.invoke('settings:set', 'wizardCompleted', true)
    } catch (err) {
      console.error('Error saving wizard state:', err)
    }
    onComplete()
  }

  const handleFinish = async () => {
    if (!name || !model) {
      setError('Name and model are required')
      return
    }
    try {
      setSaving(true)
      await window.electron.invoke('printer:configured:add', {
        name,
        model,
        ipAddress: ipAddress || undefined,
        port: port || undefined,
      })
      await window.electron.invoke('settings:set', 'wizardCompleted', true)
      onComplete()
    } catch (err) {
      setError('Failed to save printer')
      console.error('Error saving printer:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-ground flex items-center justify-center p-4">
      <div className="bg-raised rounded-lg shadow-2xl max-w-md w-full p-6">
        <h1 className="text-2xl font-bold text-fg mb-1">Welcome to kuziSlicer</h1>
        <p className="text-fg2 mb-6">Let's set up your first printer.</p>

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 rounded text-red-700 text-sm">{error}</div>
        )}

        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-fg mb-1">Printer Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., My Prusa"
              className="w-full px-3 py-2 border border-fg2/20 rounded-lg bg-ground text-fg focus:outline-none focus:border-ember"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-fg mb-1">Printer Model *</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-3 py-2 border border-fg2/20 rounded-lg bg-ground text-fg focus:outline-none focus:border-ember"
            >
              <option value="">Select a model...</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-fg mb-1">IP Address (optional)</label>
            <input
              type="text"
              value={ipAddress}
              onChange={(e) => setIpAddress(e.target.value)}
              placeholder="e.g., 192.168.1.100"
              className="w-full px-3 py-2 border border-fg2/20 rounded-lg bg-ground text-fg focus:outline-none focus:border-ember"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-fg mb-1">Port</label>
            <input
              type="text"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="5000"
              className="w-full px-3 py-2 border border-fg2/20 rounded-lg bg-ground text-fg focus:outline-none focus:border-ember"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSkip}
            className="flex-1 px-4 py-2 bg-fg2/10 text-fg font-medium rounded-lg hover:bg-fg2/20 transition-colors"
          >
            Skip
          </button>
          <button
            onClick={handleFinish}
            disabled={saving}
            className="flex-1 px-4 py-2 bg-ember text-onEmber font-medium rounded-lg hover:bg-emberInk transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Finish Setup'}
          </button>
        </div>
      </div>
    </div>
  )
}
