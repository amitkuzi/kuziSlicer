import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { parseGcodeToolpath, FEATURE_COLORS, ToolpathData } from '../../utils/gcodeToolpath'

interface GcodePreviewProps {
  gcode: string
  /** Bed size in mm, for the plate grid. */
  bedSize?: { x: number; y: number }
}

/**
 * Toolpath preview in the style of ElegooSlicer / Bambu Studio:
 * orbit + pan + zoom, a layer range slider, feature-coloured extrusions and
 * optional travel moves.
 */
export const GcodePreview: React.FC<GcodePreviewProps> = ({ gcode, bedSize = { x: 220, y: 220 } }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const extrudeRef = useRef<THREE.LineSegments | null>(null)
  const travelRef = useRef<THREE.LineSegments | null>(null)
  const fitRef = useRef<(() => void) | null>(null)

  const [visibleLayer, setVisibleLayer] = useState(0)
  const [showTravel, setShowTravel] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Parsing is the expensive part, so it only reruns when the G-code itself changes.
  const toolpath: ToolpathData = useMemo(() => parseGcodeToolpath(gcode), [gcode])
  const layerCount = toolpath.layers.length

  useEffect(() => {
    setVisibleLayer(Math.max(0, layerCount - 1))
  }, [layerCount])

  // --- scene setup: runs once, independent of the G-code being shown ---
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    } catch (err) {
      setError('WebGL is unavailable in this environment, so the toolpath preview cannot render.')
      return
    }

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x14161a)

    const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 5000)
    const controls = new OrbitControls(camera, canvas)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.screenSpacePanning = true // pan drags the model with the cursor, like Elegoo's viewer
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    }
    controlsRef.current = controls

    // Build plate: grid + outline, centred on the bed like the printer sees it.
    const grid = new THREE.GridHelper(Math.max(bedSize.x, bedSize.y), 20, 0x3a4048, 0x24282e)
    grid.rotation.x = Math.PI / 2 // GridHelper is XZ by default; printers work in XY
    grid.position.set(bedSize.x / 2, bedSize.y / 2, 0)
    scene.add(grid)

    const plate = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(bedSize.x, 0, 0),
        new THREE.Vector3(bedSize.x, bedSize.y, 0),
        new THREE.Vector3(0, bedSize.y, 0),
      ]),
      new THREE.LineBasicMaterial({ color: 0x5a6472 })
    )
    scene.add(plate)

    const extrude = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ vertexColors: true })
    )
    scene.add(extrude)
    extrudeRef.current = extrude

    const travel = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x4da3ff, transparent: true, opacity: 0.35 })
    )
    travel.visible = false
    scene.add(travel)
    travelRef.current = travel

    // Frame whatever is currently loaded, from a 3/4 view.
    fitRef.current = () => {
      const geometry = extrude.geometry
      geometry.computeBoundingSphere()
      const sphere = geometry.boundingSphere
      const center = sphere && sphere.radius > 0
        ? sphere.center
        : new THREE.Vector3(bedSize.x / 2, bedSize.y / 2, 0)
      const radius = sphere && sphere.radius > 0 ? sphere.radius : Math.max(bedSize.x, bedSize.y) / 2

      controls.target.copy(center)
      const distance = radius * 2.6
      camera.position.set(center.x + distance * 0.7, center.y - distance * 0.9, center.z + distance * 0.6)
      camera.up.set(0, 0, 1) // Z-up: match the printer's coordinate system
      camera.near = Math.max(0.5, radius / 100)
      camera.far = distance * 12
      camera.updateProjectionMatrix()
      controls.update()
    }

    const resize = () => {
      const parent = canvas.parentElement
      if (!parent) return
      const width = parent.clientWidth
      const height = parent.clientHeight
      if (width === 0 || height === 0) return
      renderer.setSize(width, height, false)
      renderer.setPixelRatio(window.devicePixelRatio)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    resize()
    const observer = new ResizeObserver(resize)
    if (canvas.parentElement) observer.observe(canvas.parentElement)

    let frame = 0
    const animate = () => {
      frame = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      controls.dispose()
      extrude.geometry.dispose()
      ;(extrude.material as THREE.Material).dispose()
      travel.geometry.dispose()
      ;(travel.material as THREE.Material).dispose()
      renderer.dispose()
    }
  }, [bedSize.x, bedSize.y])

  // --- upload toolpath vertices whenever the parsed G-code changes ---
  useEffect(() => {
    const extrude = extrudeRef.current
    const travel = travelRef.current
    if (!extrude || !travel) return

    extrude.geometry.dispose()
    travel.geometry.dispose()

    const extrudeGeometry = new THREE.BufferGeometry()
    extrudeGeometry.setAttribute('position', new THREE.BufferAttribute(toolpath.extrudePositions, 3))
    extrudeGeometry.setAttribute('color', new THREE.BufferAttribute(toolpath.extrudeColors, 3))
    extrude.geometry = extrudeGeometry

    const travelGeometry = new THREE.BufferGeometry()
    travelGeometry.setAttribute('position', new THREE.BufferAttribute(toolpath.travelPositions, 3))
    travel.geometry = travelGeometry

    fitRef.current?.()
  }, [toolpath])

  // --- layer slider: a draw-range crop, since vertices are already ordered by layer ---
  useEffect(() => {
    const extrude = extrudeRef.current
    const travel = travelRef.current
    if (!extrude || !travel || layerCount === 0) return

    const layer = toolpath.layers[Math.min(visibleLayer, layerCount - 1)]
    extrude.geometry.setDrawRange(0, layer.extrudeEnd)
    travel.geometry.setDrawRange(0, layer.travelEnd)
    travel.visible = showTravel
  }, [visibleLayer, showTravel, toolpath, layerCount])

  const currentLayer = toolpath.layers[Math.min(visibleLayer, Math.max(0, layerCount - 1))]

  return (
    <div className="w-full h-full flex flex-col bg-[#14161a] relative">
      <div className="flex-1 relative min-h-0">
        <canvas ref={canvasRef} className="w-full h-full block" />

        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-fg2">
            {error}
          </div>
        )}

        {!error && layerCount === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/50">
            Generate or load G-code to see the toolpath.
          </div>
        )}

        {!error && layerCount > 0 && (
          <>
            {/* Feature legend */}
            <div className="absolute top-3 left-3 rounded bg-black/50 px-3 py-2 text-xs text-white/80 space-y-1">
              {Object.entries(FEATURE_COLORS).map(([feature, color]) => (
                <div key={feature} className="flex items-center gap-2">
                  <span
                    className="inline-block w-3 h-1.5 rounded"
                    style={{ backgroundColor: `#${color.toString(16).padStart(6, '0')}` }}
                  />
                  <span className="capitalize">{feature.replace(/-/g, ' ').toLowerCase()}</span>
                </div>
              ))}
            </div>

            {/* Layer slider */}
            <div className="absolute top-3 right-3 bottom-3 flex flex-col items-center gap-2 rounded bg-black/50 px-2 py-3">
              <span className="text-[10px] text-white/70">{layerCount}</span>
              <input
                type="range"
                min={0}
                max={Math.max(0, layerCount - 1)}
                value={Math.min(visibleLayer, layerCount - 1)}
                onChange={(e) => setVisibleLayer(parseInt(e.target.value))}
                aria-label="Visible layers"
                className="flex-1 accent-ember cursor-pointer"
                style={{ writingMode: 'vertical-lr', direction: 'rtl', width: '18px' }}
              />
              <span className="text-[10px] text-white/70">1</span>
            </div>

            {/* Readout + controls */}
            <div className="absolute bottom-3 left-3 flex items-center gap-3 rounded bg-black/50 px-3 py-2 text-xs text-white/80">
              <span>
                Layer {Math.min(visibleLayer, layerCount - 1) + 1}/{layerCount}
              </span>
              {currentLayer && <span>Z {currentLayer.z.toFixed(2)}mm</span>}
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showTravel}
                  onChange={(e) => setShowTravel(e.target.checked)}
                  className="accent-ember"
                />
                Travel
              </label>
              <button onClick={() => fitRef.current?.()} className="underline hover:text-white">
                Fit
              </button>
            </div>

            <div className="absolute bottom-3 right-3 rounded bg-black/50 px-3 py-2 text-[10px] text-white/50">
              Drag: rotate · Right-drag: pan · Wheel: zoom
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default GcodePreview
