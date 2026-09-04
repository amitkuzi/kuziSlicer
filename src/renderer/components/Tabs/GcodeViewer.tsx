import React, { useState, useEffect, useRef } from 'react'
import * as THREE from 'three'
import { ConfiguredPrinter } from '../../../types/ipc'

interface GcodeStats {
  lines: number
  size: number
  layers: number
  estimatedTime: number
  filamentUsage: number
}

export const GcodeViewer: React.FC<{ gcode?: string }> = ({ gcode = '' }) => {
  const [code, setCode] = useState(gcode)

  // Sync when a freshly generated/loaded gcode prop arrives while already mounted
  useEffect(() => {
    if (gcode) setCode(gcode)
  }, [gcode])
  const [printers, setPrinters] = useState<ConfiguredPrinter[]>([])
  const [selectedPrinter, setSelectedPrinter] = useState<string>('')
  const [bambuAccessCode, setBambuAccessCode] = useState('')
  const [bambuSerialNumber, setBambuSerialNumber] = useState('')
  const [elegooSnapshot, setElegooSnapshot] = useState<string | null>(null)
  const [snapshotLoading, setSnapshotLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [stats, setStats] = useState<GcodeStats>({ lines: 0, size: 0, layers: 0, estimatedTime: 0, filamentUsage: 0 })
  const [showPreview, setShowPreview] = useState(true)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)

  // Parse G-code and calculate stats
  useEffect(() => {
    if (code) {
      const lines = code.split('\n')
      let layerCount = 0
      let filament = 0

      lines.forEach((line) => {
        if (line.includes('G0 Z')) layerCount++
        if (line.includes('E')) {
          const eMatch = line.match(/E([\d.]+)/)
          if (eMatch) filament += parseFloat(eMatch[1])
        }
      })

      setStats({
        lines: lines.length,
        size: new Blob([code]).size,
        layers: layerCount,
        estimatedTime: Math.round(lines.length / 20), // rough estimate: 20 commands/min
        filamentUsage: Math.round(filament * 100) / 100,
      })
    }
  }, [code])

  // Initialize 3D preview
  useEffect(() => {
    if (!canvasRef.current || !showPreview) return

    const width = canvasRef.current.clientWidth
    const height = canvasRef.current.clientHeight

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x1a1a1a)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000)
    camera.position.z = 150

    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(window.devicePixelRatio)
    rendererRef.current = renderer

    // Add grid
    const gridHelper = new THREE.GridHelper(200, 10)
    scene.add(gridHelper)

    // Add axes
    const axesHelper = new THREE.AxesHelper(50)
    scene.add(axesHelper)

    // Parse G-code and render toolpath
    const geometry = new THREE.BufferGeometry()
    const printGeometry = new THREE.BufferGeometry()
    const positions: number[] = []
    const printPositions: number[] = []

    let x = 0, y = 0, z = 0
    let inTravel = true

    code.split('\n').forEach((line) => {
      if (line.startsWith('G0')) {
        inTravel = true
      } else if (line.startsWith('G1')) {
        inTravel = false
      }

      const xMatch = line.match(/X([\d.-]+)/)
      const yMatch = line.match(/Y([\d.-]+)/)
      const zMatch = line.match(/Z([\d.-]+)/)
      const eMatch = line.match(/E([\d.-]+)/)

      if (xMatch) x = parseFloat(xMatch[1])
      if (yMatch) y = parseFloat(yMatch[1])
      if (zMatch) z = parseFloat(zMatch[1])

      if (eMatch || (xMatch || yMatch || zMatch)) {
        if (inTravel) {
          positions.push(x, y, z)
        } else {
          printPositions.push(x, y, z)
        }
      }
    })

    // Add travel moves (yellow dashed)
    if (positions.length > 0) {
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
      const material = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 1 })
      const line = new THREE.Line(geometry, material)
      scene.add(line)
    }

    // Add print moves (blue solid)
    if (printPositions.length > 0) {
      printGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(printPositions), 3))
      const material = new THREE.LineBasicMaterial({ color: 0x0088ff, linewidth: 2 })
      const line = new THREE.Line(printGeometry, material)
      scene.add(line)
    }

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate)
      renderer.render(scene, camera)
    }

    animate()

    // Handle window resize
    const handleResize = () => {
      const newWidth = canvasRef.current?.clientWidth || width
      const newHeight = canvasRef.current?.clientHeight || height
      camera.aspect = newWidth / newHeight
      camera.updateProjectionMatrix()
      renderer.setSize(newWidth, newHeight)
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      renderer.dispose()
    }
  }, [code, showPreview])

  // Fetch printer list
  useEffect(() => {
    const fetchPrinters = async () => {
      try {
        // Try to get configured printers (added by user in PrinterManagement)
        const result = (await (window as any).electron.invoke('printer:configured:list')) as ConfiguredPrinter[]
        setPrinters(result)
        if (result.length > 0) {
          setSelectedPrinter(result[0].id)
        }
      } catch (err) {
        // Fallback to empty list if handler doesn't exist yet
        console.warn('Failed to fetch printers:', err)
        setPrinters([])
      }
    }

    fetchPrinters()
  }, [])

  const handleFileLoad = async () => {
    try {
      const result = (await (window as any).electron.invoke('file:open')) as { canceled: boolean; filePaths: string[] }
      if (!result.canceled && result.filePaths[0]) {
        // Read file content via IPC
        const readResult = (await (window as any).electron.invoke('file:read', result.filePaths[0])) as { success: boolean; content?: string; error?: string }
        if (readResult.success && readResult.content) {
          setCode(readResult.content)
          setMessage({ type: 'success', text: 'G-code loaded successfully' })
          setTimeout(() => setMessage(null), 2000)
        } else {
          setMessage({ type: 'error', text: `Failed to read file: ${readResult.error}` })
        }
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to load file' })
    }
  }

  const handleDownload = () => {
    const element = document.createElement('a')
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(code))
    element.setAttribute('download', 'print.gcode')
    element.style.display = 'none'
    document.body.appendChild(element)
    element.click()
    document.body.removeChild(element)
  }

  const isBambuPrinter = (printer?: ConfiguredPrinter) =>
    !!printer && /bambu/i.test(`${printer.name} ${printer.model}`)

  const isElegooPrinter = (printer?: ConfiguredPrinter) =>
    !!printer && /elegoo|centauri/i.test(`${printer.name} ${printer.model}`)

  const selectedPrinterObj = printers.find((p) => p.id === selectedPrinter)

  const handleSendToPrinter = async () => {
    if (!selectedPrinter || !code) {
      setMessage({ type: 'error', text: 'Please select a printer and load G-code' })
      return
    }

    const printer = selectedPrinterObj
    if (isBambuPrinter(printer)) {
      if (!printer?.ipAddress) {
        setMessage({ type: 'error', text: 'This printer has no IP address configured (Printer Management tab).' })
        return
      }
      if (!bambuAccessCode.trim() || !bambuSerialNumber.trim()) {
        setMessage({ type: 'error', text: 'Enter the printer\'s Access Code and Serial Number (LAN Only Mode screen on the printer).' })
        return
      }
    }
    if (isElegooPrinter(printer) && !printer?.ipAddress) {
      setMessage({ type: 'error', text: 'This printer has no IP address configured (Printer Management tab).' })
      return
    }

    setIsUploading(true)
    setUploadProgress(0)

    try {
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => (prev >= 90 ? prev : prev + Math.random() * 30))
      }, 200)

      let result: { success: boolean; message: string }
      if (isBambuPrinter(printer)) {
        result = (await (window as any).electron.invoke('printer:bambu-print', {
          ip: printer!.ipAddress,
          accessCode: bambuAccessCode.trim(),
          serialNumber: bambuSerialNumber.trim(),
          gcode: code,
          fileName: 'kuziSlicer_print.gcode',
        })) as { success: boolean; message: string }
      } else if (isElegooPrinter(printer)) {
        result = (await (window as any).electron.invoke('printer:elegoo-print', {
          ip: printer!.ipAddress,
          gcode: code,
          fileName: 'kuziSlicer_print.gcode',
        })) as { success: boolean; message: string }
      } else {
        result = (await (window as any).electron.invoke('gcode:send', {
          printer: selectedPrinter,
          gcode: code,
        })) as { success: boolean; message: string }
      }

      clearInterval(progressInterval)
      setUploadProgress(100)

      if (result.success) {
        setMessage({ type: 'success', text: result.message || `Print started on ${printer?.name || 'printer'}` })
        setTimeout(() => setMessage(null), 5000)
      } else {
        setMessage({ type: 'error', text: result.message })
      }
    } catch (err) {
      setMessage({ type: 'error', text: `Failed to send to printer: ${String(err)}` })
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
    }
  }

  const handleCaptureSnapshot = async () => {
    if (!selectedPrinterObj?.ipAddress) return
    setSnapshotLoading(true)
    try {
      const result = (await (window as any).electron.invoke('printer:elegoo-snapshot', {
        ip: selectedPrinterObj.ipAddress,
      })) as { success: boolean; dataUrl?: string; message?: string }
      if (result.success && result.dataUrl) {
        setElegooSnapshot(result.dataUrl)
      } else {
        setMessage({ type: 'error', text: result.message || 'Failed to capture camera snapshot' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: `Failed to capture camera snapshot: ${String(err)}` })
    } finally {
      setSnapshotLoading(false)
    }
  }

  return (
    <div className="w-full h-full flex flex-col bg-ground">
      {/* Toolbar */}
      <div className="bg-raised border-b border-fg2/10 p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={handleFileLoad}
            className="px-4 py-2 bg-ember text-white rounded hover:bg-ember/90 text-sm font-medium"
          >
            Load G-code
          </button>
          <button
            onClick={handleDownload}
            disabled={!code}
            className="px-4 py-2 bg-brass text-base rounded hover:bg-brass/90 disabled:bg-fg2/20 text-sm font-medium"
          >
            Download
          </button>
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="px-4 py-2 bg-brass text-base rounded hover:bg-brass/90 text-sm font-medium"
          >
            {showPreview ? 'Hide Preview' : 'Show Preview'}
          </button>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-6 text-sm text-fg2">
          <span>Lines: {stats.lines}</span>
          <span>Size: {(stats.size / 1024).toFixed(1)}KB</span>
          <span>Layers: {stats.layers}</span>
          <span>Est. Time: {stats.estimatedTime}min</span>
          <span>Filament: {stats.filamentUsage}m</span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden gap-4 p-4">
        {/* Code editor */}
        <div className={`flex flex-col bg-raised rounded border border-fg2/10 ${showPreview ? 'w-1/2' : 'w-full'}`}>
          <div className="p-3 border-b border-fg2/10 flex items-center justify-between">
            <h3 className="font-semibold text-fg">G-code</h3>
            <div className="flex items-center gap-2">
              <select
                value={selectedPrinter}
                onChange={(e) => setSelectedPrinter(e.target.value)}
                className="px-3 py-1 bg-ground text-fg text-sm rounded border border-fg2/20"
              >
                <option value="">Select Printer</option>
                {printers.map((printer) => (
                  <option key={printer.id} value={printer.id}>
                    {printer.name} ({printer.status})
                  </option>
                ))}
              </select>
              <button
                onClick={handleSendToPrinter}
                disabled={!selectedPrinter || !code || isUploading}
                className="px-4 py-1 bg-ember text-white rounded hover:bg-ember/90 disabled:bg-fg2/20 text-sm font-medium"
              >
                {isUploading ? 'Uploading...' : 'Send'}
              </button>
            </div>
          </div>

          {isBambuPrinter(selectedPrinterObj) && (
            <div className="px-3 py-2 border-b border-fg2/10 flex items-center gap-2 bg-ground/50">
              <span className="text-xs text-fg2">LAN Only Mode (printer screen &rarr; Network):</span>
              <input
                type="text"
                value={bambuAccessCode}
                onChange={(e) => setBambuAccessCode(e.target.value)}
                placeholder="Access Code"
                className="px-2 py-1 text-xs bg-raised text-fg rounded border border-fg2/20 w-28"
              />
              <input
                type="text"
                value={bambuSerialNumber}
                onChange={(e) => setBambuSerialNumber(e.target.value)}
                placeholder="Serial Number"
                className="px-2 py-1 text-xs bg-raised text-fg rounded border border-fg2/20 w-40"
              />
            </div>
          )}

          {isElegooPrinter(selectedPrinterObj) && (
            <div className="px-3 py-2 border-b border-fg2/10 flex items-center gap-2 bg-ground/50">
              <span className="text-xs text-fg2">SDCP LAN printing (no access code needed):</span>
              <button
                onClick={handleCaptureSnapshot}
                disabled={snapshotLoading || !selectedPrinterObj?.ipAddress}
                className="px-2 py-1 text-xs bg-brass text-base rounded hover:bg-brass/90 disabled:bg-fg2/20"
              >
                {snapshotLoading ? 'Capturing...' : 'Camera Snapshot'}
              </button>
              {elegooSnapshot && (
                <img src={elegooSnapshot} alt="Printer camera snapshot" className="h-12 rounded border border-fg2/20" />
              )}
            </div>
          )}

          {/* Progress bar */}
          {isUploading && (
            <div className="px-3 pt-2 pb-1">
              <div className="w-full h-2 bg-fg2/10 rounded overflow-hidden">
                <div
                  className="h-full bg-ember transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Message */}
          {message && (
            <div
              className={`px-3 py-2 text-sm font-medium ${
                message.type === 'success'
                  ? 'bg-green-500/20 text-green-200'
                  : 'bg-red-500/20 text-red-200'
              }`}
            >
              {message.text}
            </div>
          )}

          {/* Code area */}
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="flex-1 p-3 bg-ground text-fg font-mono text-sm resize-none border-0 focus:outline-none focus:ring-2 focus:ring-ember/50 rounded-b"
            placeholder="Load or paste G-code here..."
            spellCheck={false}
          />
        </div>

        {/* 3D Preview */}
        {showPreview && (
          <div className="flex-1 bg-raised rounded border border-fg2/10 overflow-hidden">
            <div className="p-3 border-b border-fg2/10">
              <h3 className="font-semibold text-fg">Print Path Preview</h3>
              <p className="text-xs text-fg2 mt-1">Blue: print moves | Yellow: travel moves</p>
            </div>
            <canvas
              ref={canvasRef}
              className="w-full h-full"
              style={{ display: 'block' }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
