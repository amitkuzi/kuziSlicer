import React, { useState, useEffect } from 'react'
import { ConfiguredPrinter } from '../../../types/ipc'

type ModalMode = 'add' | 'edit' | null
type ConfirmAction = 'delete' | null

interface PrinterModels {
  id: string
  name: string
}

interface FormData {
  name: string
  model: string
  ipAddress: string
  port: string
}

const INITIAL_FORM: FormData = {
  name: '',
  model: '',
  ipAddress: '',
  port: '5000',
}

export const PrinterManagement: React.FC = () => {
  const [printers, setPrinters] = useState<ConfiguredPrinter[]>([])
  const [models, setModels] = useState<PrinterModels[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalMode, setModalMode] = useState<ModalMode>(null)
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [testingConnection, setTestingConnection] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ id: string; success: boolean } | null>(null)

  // Load printers and models on mount
  useEffect(() => {
    loadPrinters()
    loadModels()
  }, [])

  const loadPrinters = async () => {
    try {
      setLoading(true)
      const data = (await window.electron.invoke('printer:configured:list')) as ConfiguredPrinter[]
      setPrinters(data || [])
      setError(null)
    } catch (err) {
      setError('Failed to load printers')
      console.error('Error loading printers:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadModels = async () => {
    try {
      const printers = (await window.electron.invoke('gcode:printers')) as PrinterModels[]
      setModels(printers.map((p) => ({ id: p.id, name: p.name })))
    } catch (err) {
      console.error('Error loading printer models:', err)
    }
  }

  const handleAddClick = () => {
    setFormData(INITIAL_FORM)
    setEditingId(null)
    setModalMode('add')
  }

  const handleEditClick = (printer: ConfiguredPrinter) => {
    setFormData({
      name: printer.name,
      model: printer.model,
      ipAddress: printer.ipAddress || '',
      port: printer.port || '5000',
    })
    setEditingId(printer.id)
    setModalMode('edit')
  }

  const handleDeleteClick = (id: string) => {
    setConfirmId(id)
    setConfirmAction('delete')
  }

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleTestConnection = async () => {
    if (!formData.ipAddress) {
      setTestResult({ id: 'form', success: false })
      return
    }
    try {
      setTestingConnection('form')
      const success = (await window.electron.invoke('printer:test-connection', formData.ipAddress, formData.port)) as boolean
      setTestResult({ id: 'form', success })
    } catch (err) {
      console.error('Connection test failed:', err)
      setTestResult({ id: 'form', success: false })
    } finally {
      setTestingConnection(null)
    }
  }

  const handleSavePrinter = async () => {
    if (!formData.name || !formData.model) {
      setError('Name and model are required')
      return
    }

    try {
      if (modalMode === 'add') {
        await window.electron.invoke('printer:configured:add', {
          name: formData.name,
          model: formData.model,
          ipAddress: formData.ipAddress || undefined,
          port: formData.port || undefined,
        })
      } else if (modalMode === 'edit' && editingId) {
        await window.electron.invoke('printer:configured:update', editingId, {
          name: formData.name,
          model: formData.model,
          ipAddress: formData.ipAddress || undefined,
          port: formData.port || undefined,
        })
      }
      await loadPrinters()
      setModalMode(null)
      setFormData(INITIAL_FORM)
      setTestResult(null)
    } catch (err) {
      setError('Failed to save printer')
      console.error('Error saving printer:', err)
    }
  }

  const handleConfirmDelete = async () => {
    if (!confirmId) return
    try {
      await window.electron.invoke('printer:configured:delete', confirmId)
      await loadPrinters()
      setConfirmAction(null)
      setConfirmId(null)
    } catch (err) {
      setError('Failed to delete printer')
      console.error('Error deleting printer:', err)
    }
  }

  const getStatusIcon = (status: ConfiguredPrinter['status']) => {
    switch (status) {
      case 'online':
        return '🟢'
      case 'offline':
        return '🔴'
      default:
        return '⚪'
    }
  }

  const getStatusLabel = (status: ConfiguredPrinter['status']) => {
    switch (status) {
      case 'online':
        return 'Online'
      case 'offline':
        return 'Offline'
      default:
        return 'Unknown'
    }
  }

  const formatLastConnected = (timestamp?: string) => {
    if (!timestamp) return 'Never'
    const date = new Date(timestamp)
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="flex-1 overflow-auto p-6 bg-ground">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-fg mb-1">Printer Management</h1>
          <p className="text-fg2">Configure and manage your 3D printers</p>
        </div>
        <button
          onClick={handleAddClick}
          className="px-6 py-2 bg-ember text-onEmber font-medium rounded-lg hover:bg-emberInk transition-colors"
        >
          + Add Printer
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-4 bg-red-100 border border-red-400 rounded text-red-700">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="text-4xl mb-4">⏳</div>
            <p className="text-fg2">Loading printers...</p>
          </div>
        </div>
      )}

      {/* Printers Grid */}
      {!loading && printers.length === 0 && (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="text-6xl mb-4">🖨️</div>
            <h3 className="text-xl font-semibold text-fg mb-2">No printers configured</h3>
            <p className="text-fg2 mb-4">Add your first printer to get started</p>
            <button
              onClick={handleAddClick}
              className="px-6 py-2 bg-ember text-onEmber font-medium rounded-lg hover:bg-emberInk transition-colors"
            >
              Add Printer
            </button>
          </div>
        </div>
      )}

      {!loading && printers.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {printers.map((printer) => (
            <div
              key={printer.id}
              onClick={() => handleEditClick(printer)}
              className="bg-raised rounded-lg border border-fg2/10 p-4 hover:border-ember/50 hover:shadow-md transition-all cursor-pointer"
            >
              {/* Status Indicator */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{getStatusIcon(printer.status)}</span>
                  <span className="text-sm font-medium text-fg2">{getStatusLabel(printer.status)}</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDeleteClick(printer.id)
                  }}
                  className="px-3 py-1 text-sm bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                >
                  Delete
                </button>
              </div>

              {/* Printer Name */}
              <h3 className="text-lg font-bold text-fg mb-2">{printer.name}</h3>

              {/* Model */}
              <div className="mb-3 pb-3 border-b border-fg2/10">
                <p className="text-sm text-fg2">Model</p>
                <p className="font-medium text-fg text-sm">{printer.model}</p>
              </div>

              {/* Connection Details */}
              <div className="mb-3 pb-3 border-b border-fg2/10">
                {printer.ipAddress && (
                  <>
                    <p className="text-sm text-fg2">IP Address</p>
                    <p className="font-mono text-sm text-fg mb-1">{printer.ipAddress}</p>
                  </>
                )}
                {printer.port && (
                  <>
                    <p className="text-sm text-fg2">Port</p>
                    <p className="font-mono text-sm text-fg">{printer.port}</p>
                  </>
                )}
              </div>

              {/* Last Connected */}
              <div className="text-xs text-fg2">
                <span>Last connected: {formatLastConnected(printer.lastConnected)}</span>
              </div>

              {/* Click Hint */}
              <div className="mt-3 text-xs text-fg2/50">Click to edit</div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {modalMode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-raised rounded-lg shadow-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-fg mb-4">
              {modalMode === 'add' ? 'Add New Printer' : 'Edit Printer'}
            </h2>

            {/* Form Fields */}
            <div className="space-y-4 mb-6">
              {/* Name Input */}
              <div>
                <label className="block text-sm font-medium text-fg mb-1">Printer Name *</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleFormChange}
                  placeholder="e.g., My Prusa"
                  className="w-full px-3 py-2 border border-fg2/20 rounded-lg bg-ground text-fg focus:outline-none focus:border-ember"
                />
              </div>

              {/* Model Dropdown */}
              <div>
                <label className="block text-sm font-medium text-fg mb-1">Printer Model *</label>
                <select
                  name="model"
                  value={formData.model}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 border border-fg2/20 rounded-lg bg-ground text-fg focus:outline-none focus:border-ember"
                >
                  <option value="">Select a model...</option>
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* IP Address Input */}
              <div>
                <label className="block text-sm font-medium text-fg mb-1">IP Address</label>
                <input
                  type="text"
                  name="ipAddress"
                  value={formData.ipAddress}
                  onChange={handleFormChange}
                  placeholder="e.g., 192.168.1.100"
                  className="w-full px-3 py-2 border border-fg2/20 rounded-lg bg-ground text-fg focus:outline-none focus:border-ember"
                />
              </div>

              {/* Port Input */}
              <div>
                <label className="block text-sm font-medium text-fg mb-1">Port</label>
                <input
                  type="text"
                  name="port"
                  value={formData.port}
                  onChange={handleFormChange}
                  placeholder="5000"
                  className="w-full px-3 py-2 border border-fg2/20 rounded-lg bg-ground text-fg focus:outline-none focus:border-ember"
                />
              </div>

              {/* Test Connection */}
              {formData.ipAddress && (
                <div>
                  <button
                    onClick={handleTestConnection}
                    disabled={testingConnection === 'form'}
                    className="w-full px-3 py-2 bg-brass/20 text-brass font-medium rounded-lg hover:bg-brass/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {testingConnection === 'form' ? '🔄 Testing...' : '🧪 Test Connection'}
                  </button>
                  {testResult?.id === 'form' && (
                    <p className={`mt-2 text-sm ${testResult.success ? 'text-green-600' : 'text-red-600'}`}>
                      {testResult.success ? '✓ Connection successful' : '✗ Connection failed'}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setModalMode(null)
                  setFormData(INITIAL_FORM)
                  setTestResult(null)
                }}
                className="flex-1 px-4 py-2 bg-fg2/10 text-fg font-medium rounded-lg hover:bg-fg2/20 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePrinter}
                className="flex-1 px-4 py-2 bg-ember text-onEmber font-medium rounded-lg hover:bg-emberInk transition-colors"
              >
                {modalMode === 'add' ? 'Add Printer' : 'Update Printer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmAction === 'delete' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-raised rounded-lg shadow-2xl max-w-sm w-full p-6">
            <h2 className="text-xl font-bold text-fg mb-4">Delete Printer?</h2>
            <p className="text-fg2 mb-6">
              Are you sure you want to delete this printer? This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setConfirmAction(null)
                  setConfirmId(null)
                }}
                className="flex-1 px-4 py-2 bg-fg2/10 text-fg font-medium rounded-lg hover:bg-fg2/20 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="flex-1 px-4 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
