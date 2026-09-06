import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader'
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls'
import {
  VIEWPORT_TOOLS,
  ModelTransform,
  IDENTITY_TRANSFORM,
  GizmoMode,
} from '../../utils/viewportTools'

interface ModelStats {
  vertices: number
  triangles: number
  size: { x: number; y: number; z: number }
}

interface ModelViewerProps {
  onModelLoaded?: (path: string | null, fileName: string) => void
  // Bumped by the sidebar's "Load Model" button to pop the file dialog from anywhere
  openDialogSignal?: number
  /** Reports move/rotate/scale so slicing prints what the viewport shows. */
  onTransformChange?: (transform: ModelTransform) => void
  bedSize?: { x: number; y: number }
}

export const ModelViewer: React.FC<ModelViewerProps> = ({
  onModelLoaded,
  openDialogSignal,
  onTransformChange,
  bedSize = { x: 220, y: 220 },
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const modelRef = useRef<THREE.Group | null>(null)
  const transformRef = useRef<TransformControls | null>(null)
  const reportTransformRef = useRef<(() => void) | null>(null)

  const [activeTool, setActiveTool] = useState<GizmoMode | null>(null)
  const [transform, setTransform] = useState<ModelTransform>(IDENTITY_TRANSFORM)
  const [stats, setStats] = useState<ModelStats | null>(null)
  const [wireframe, setWireframe] = useState(false)
  const [fileLoaded, setFileLoaded] = useState(false)
  const [pathInput, setPathInput] = useState('')
  const [pathError, setPathError] = useState<string | null>(null)
  const [webglError, setWebglError] = useState<string | null>(null)

  // Initialize Three.js scene
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Scene
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xf4efe7)
    sceneRef.current = scene

    // Camera
    const camera = new THREE.PerspectiveCamera(
      75,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      1000
    )
    // Z-up: printers work in Z-up and STL/3MF models are authored that way, so the
    // viewport matches the plate and the G-code preview instead of lying on its side.
    camera.up.set(0, 0, 1)
    camera.position.set(bedSize.x * 0.9, -bedSize.y * 0.9, bedSize.x * 0.7)
    cameraRef.current = camera

    // Renderer -- some environments (remote desktop / VM / disabled GPU driver) refuse a
    // hardware-accelerated context; retry allowing a software fallback before giving up.
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    } catch {
      try {
        const ctx = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false })
          || canvas.getContext('webgl', { failIfMajorPerformanceCaveat: false })
        if (!ctx) throw new Error('No WebGL context available')
        renderer = new THREE.WebGLRenderer({ canvas, context: ctx as WebGLRenderingContext, antialias: true })
      } catch (err) {
        console.error('WebGL initialization failed:', err)
        setWebglError(
          'WebGL is unavailable in this environment (GPU/driver issue), so the 3D preview cannot run. ' +
          'G-code generation and printer/filament selection are unaffected.'
        )
        return
      }
    }
    renderer.setSize(canvas.clientWidth, canvas.clientHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
    rendererRef.current = renderer

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(10, 20, 15)
    scene.add(directionalLight)

    // Build plate, so the model's size and position on the bed are readable at a glance.
    const grid = new THREE.GridHelper(Math.max(bedSize.x, bedSize.y), 22, 0xb9ada0, 0xdcd3c7)
    grid.rotation.x = Math.PI / 2 // GridHelper lies in XZ by default; printers use XY
    grid.position.set(bedSize.x / 2, bedSize.y / 2, 0)
    scene.add(grid)

    const plate = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(bedSize.x, 0, 0),
        new THREE.Vector3(bedSize.x, bedSize.y, 0),
        new THREE.Vector3(0, bedSize.y, 0),
      ]),
      new THREE.LineBasicMaterial({ color: 0xe4632d })
    )
    scene.add(plate)

    // Controls
    const controls = new OrbitControls(camera, canvas)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.screenSpacePanning = true
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    }
    controls.target.set(bedSize.x / 2, bedSize.y / 2, 0)
    controls.update()
    controlsRef.current = controls

    // Move/rotate/scale gizmos. In three r169+ TransformControls is no longer an
    // Object3D -- its visual helper has to be added to the scene separately.
    const transformControls = new TransformControls(camera, canvas)
    transformControls.setSpace('world')
    scene.add(transformControls.getHelper())
    transformRef.current = transformControls

    // Orbiting while dragging a gizmo would fight the drag.
    transformControls.addEventListener('dragging-changed', (event) => {
      controls.enabled = !(event as unknown as { value: boolean }).value
    })

    const reportTransform = () => {
      const model = modelRef.current
      if (!model) return
      // Keep the model on the plate: dragging it below z=0 would slice into the bed.
      const box = new THREE.Box3().setFromObject(model)
      if (box.min.z < 0) model.position.z -= box.min.z

      const next: ModelTransform = {
        position: [model.position.x, model.position.y, model.position.z],
        rotation: [model.rotation.x, model.rotation.y, model.rotation.z],
        scale: [model.scale.x, model.scale.y, model.scale.z],
      }
      setTransform(next)
      onTransformChange?.(next)
    }
    reportTransformRef.current = reportTransform
    transformControls.addEventListener('objectChange', reportTransform)

    // Handle window resize
    const handleResize = () => {
      if (!canvas.parentElement) return
      const width = canvas.parentElement.clientWidth
      const height = canvas.parentElement.clientHeight

      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    }

    window.addEventListener('resize', handleResize)

    // Animation loop
    let frame = 0
    const animate = () => {
      frame = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', handleResize)
      transformControls.detach()
      transformControls.dispose()
      controls.dispose()
      renderer.dispose()
    }
  }, [bedSize.x, bedSize.y])

  // Toolbar / keyboard selection drives which gizmo is showing.
  useEffect(() => {
    const gizmo = transformRef.current
    if (!gizmo) return
    if (activeTool && modelRef.current) {
      gizmo.setMode(activeTool)
      gizmo.attach(modelRef.current)
    } else {
      gizmo.detach()
    }
  }, [activeTool])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      if (event.key === 'Escape') return setActiveTool(null)
      const tool = VIEWPORT_TOOLS.find((t) => t.shortcut === event.key.toLowerCase())
      if (tool) setActiveTool((current) => (current === tool.mode ? null : tool.mode))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Parse + display a model already loaded into memory as an ArrayBuffer
  const loadModelFromBuffer = async (fileName: string, arrayBuffer: ArrayBuffer) => {
    if (!sceneRef.current || !cameraRef.current) return

    let model: THREE.Object3D | THREE.Group

    const lower = fileName.toLowerCase()
    if (lower.endsWith('.stl')) {
      const geometry = new STLLoader().parse(arrayBuffer)
      const material = new THREE.MeshPhongMaterial({ color: 0xe4632d })
      const mesh = new THREE.Mesh(geometry, material)
      model = new THREE.Group()
      model.add(mesh)
    } else if (lower.endsWith('.3mf')) {
      // ThreeMFLoader only exposes a synchronous parse() -- no parseAsync in this version.
      model = new ThreeMFLoader().parse(arrayBuffer)
    } else {
      throw new Error('Unsupported file format. Please use .stl or .3mf')
    }

    // Remove previous model
    if (modelRef.current) {
      transformRef.current?.detach()
      sceneRef.current.remove(modelRef.current)
    }

    // Add new model
    sceneRef.current.add(model)
    modelRef.current = model as THREE.Group
    setActiveTool(null)
    setTransform(IDENTITY_TRANSFORM)
    onTransformChange?.(IDENTITY_TRANSFORM)

    const bbox = new THREE.Box3().setFromObject(model)
    const size = bbox.getSize(new THREE.Vector3())
    const center = bbox.getCenter(new THREE.Vector3())

    // Drop the model onto the middle of the plate, sitting on z=0 -- the same place
    // the slicer puts it, so the viewport and the printed result agree.
    model.position.set(
      bedSize.x / 2 - center.x,
      bedSize.y / 2 - center.y,
      -bbox.min.z
    )

    const maxDim = Math.max(size.x, size.y, size.z) || 50
    const fov = cameraRef.current.fov * (Math.PI / 180)
    const distance = (maxDim / 2 / Math.tan(fov / 2)) * 1.8
    const focus = new THREE.Vector3(bedSize.x / 2, bedSize.y / 2, size.z / 2)

    cameraRef.current.position.set(
      focus.x + distance * 0.6,
      focus.y - distance * 0.8,
      focus.z + distance * 0.6
    )
    controlsRef.current?.target.copy(focus)
    controlsRef.current?.update()

    // Calculate stats
    let vertices = 0
    let triangles = 0
    model.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.geometry) {
        const g = obj.geometry
        vertices += g.attributes.position?.count || 0
        if (g.index) {
          triangles += g.index.count / 3
        } else {
          triangles += vertices / 3
        }
      }
    })

    setStats({
      vertices: Math.floor(vertices),
      triangles: Math.floor(triangles),
      size: {
        x: parseFloat(size.x.toFixed(2)),
        y: parseFloat(size.y.toFixed(2)),
        z: parseFloat(size.z.toFixed(2)),
      },
    })

    setFileLoaded(true)
  }

  // Load model from a browser file picker / drag-drop File object
  const handleFileLoad = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const arrayBuffer = await file.arrayBuffer()
      await loadModelFromBuffer(file.name, arrayBuffer)
      // Electron may still expose the source path on the File object; not guaranteed
      // under contextIsolation, so G-code generation should prefer the full-path loader.
      onModelLoaded?.((file as unknown as { path?: string }).path || null, file.name)
    } catch (error) {
      console.error('Error loading model:', error)
      alert('Failed to load model. Please check the file format.')
    }

    // Reset input
    event.target.value = ''
  }

  // Load model from a full filesystem path typed/pasted by the user
  const handleLoadFromPath = async () => {
    await loadFromPath(pathInput.trim())
  }

  const loadFromPath = async (filePath: string) => {
    if (!filePath) return

    setPathError(null)
    try {
      const result = (await window.electron.invoke('file:read-binary', filePath)) as {
        success: boolean
        data?: Uint8Array
        name?: string
        error?: string
      }
      if (!result.success || !result.data) {
        setPathError(result.error || 'Failed to read file')
        return
      }
      await loadModelFromBuffer(result.name || filePath, result.data.buffer as ArrayBuffer)
      onModelLoaded?.(filePath, result.name || filePath)
    } catch (error) {
      console.error('Error loading model from path:', error)
      setPathError(String(error))
    }
  }

  // Browse for a full path via native dialog, fills the path input and loads it
  const handleBrowsePath = async () => {
    const result = (await window.electron.invoke('file:open', {
      filters: [{ name: '3D Models', extensions: ['stl', '3mf'] }, { name: 'All', extensions: ['*'] }],
    })) as { canceled: boolean; filePaths: string[] }
    if (!result.canceled && result.filePaths[0]) {
      setPathInput(result.filePaths[0])
      await loadFromPath(result.filePaths[0])
    }
  }

  const handledSignal = useRef(openDialogSignal ?? 0)
  useEffect(() => {
    if (openDialogSignal === undefined || openDialogSignal === handledSignal.current) return
    handledSignal.current = openDialogSignal
    handleBrowsePath()
  }, [openDialogSignal])

  // Drop the model back to plate centre, unrotated and unscaled.
  const handleResetTransform = () => {
    const model = modelRef.current
    if (!model) return
    model.rotation.set(0, 0, 0)
    model.scale.set(1, 1, 1)
    model.position.set(0, 0, 0)
    model.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(model)
    const center = box.getCenter(new THREE.Vector3())
    model.position.set(bedSize.x / 2 - center.x, bedSize.y / 2 - center.y, -box.min.z)
    reportTransformRef.current?.()
  }

  // Toggle wireframe
  const handleWireframeToggle = () => {
    if (modelRef.current) {
      modelRef.current.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          ;(obj.material as THREE.MeshPhongMaterial).wireframe = !wireframe
        }
      })
      setWireframe(!wireframe)
    }
  }

  return (
    <div className="w-full h-full flex flex-col bg-ground">
      {/* Toolbar */}
      <div className="bg-raised border-b border-fg2/10 p-4 flex items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer px-4 py-2 bg-ember text-onEmber rounded hover:bg-emberInk transition">
          <span className="text-sm font-medium">Load Model</span>
          <input
            type="file"
            accept=".stl,.3mf"
            onChange={handleFileLoad}
            className="hidden"
          />
        </label>

        <div className="flex items-center gap-1">
          <input
            type="text"
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLoadFromPath()}
            placeholder="Full path to .stl or .3mf..."
            className="px-3 py-2 text-sm border border-fg2/20 rounded bg-raised text-fg w-64 focus:outline-none focus:border-ember"
          />
          <button
            onClick={handleBrowsePath}
            className="px-3 py-2 text-sm bg-fg2/10 text-fg rounded hover:bg-fg2/20 transition"
          >
            Browse…
          </button>
          <button
            onClick={handleLoadFromPath}
            disabled={!pathInput.trim()}
            className="px-3 py-2 text-sm bg-fg2/10 text-fg rounded hover:bg-fg2/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Load Path
          </button>
        </div>

        {fileLoaded && (
          <>
            {/* Viewport tools, rendered from the registry */}
            <div className="flex items-center gap-1 border-l border-fg2/10 pl-4">
              {VIEWPORT_TOOLS.map((tool) => (
                <button
                  key={tool.id}
                  onClick={() => setActiveTool((current) => (current === tool.mode ? null : tool.mode))}
                  title={`${tool.name} (${tool.shortcut.toUpperCase()}) — ${tool.hint}`}
                  aria-pressed={activeTool === tool.mode}
                  className={`px-3 py-2 rounded text-sm font-medium transition ${
                    activeTool === tool.mode
                      ? 'bg-ember text-onEmber'
                      : 'bg-fg2/10 text-fg hover:bg-fg2/20'
                  }`}
                >
                  <span className="mr-1">{tool.icon}</span>
                  {tool.name}
                </button>
              ))}
              <button
                onClick={handleResetTransform}
                title="Return the model to the middle of the plate, unrotated and unscaled"
                className="px-3 py-2 rounded text-sm font-medium bg-fg2/10 text-fg hover:bg-fg2/20 transition"
              >
                Reset
              </button>
            </div>

            <button
              onClick={handleWireframeToggle}
              className={`px-4 py-2 rounded text-sm font-medium transition ${
                wireframe
                  ? 'bg-ember text-onEmber'
                  : 'bg-fg2/10 text-fg hover:bg-fg2/20'
              }`}
            >
              Wireframe: {wireframe ? 'ON' : 'OFF'}
            </button>
          </>
        )}

        {stats && (
          <div className="ml-auto text-sm text-fg2 space-x-4 flex">
            <span>Vertices: {stats.vertices.toLocaleString()}</span>
            <span>Triangles: {stats.triangles.toLocaleString()}</span>
            <span>
              Size: {stats.size.x} × {stats.size.y} × {stats.size.z} mm
            </span>
          </div>
        )}
      </div>

      {pathError && (
        <div className="px-4 py-2 bg-red-100 border-b border-red-400 text-red-700 text-sm">
          {pathError}
        </div>
      )}

      {/* Canvas */}
      <div className="flex-1 relative">
        <canvas ref={canvasRef} className="w-full h-full" />

        {fileLoaded && !webglError && (
          <>
            <div className="absolute bottom-3 left-3 rounded bg-raised/90 border border-fg2/10 px-3 py-2 text-xs text-fg2 space-y-0.5">
              <div>
                Position X {transform.position[0].toFixed(1)} · Y {transform.position[1].toFixed(1)} · Z{' '}
                {transform.position[2].toFixed(1)} mm
              </div>
              <div>
                Rotation{' '}
                {transform.rotation
                  .map((r) => `${((r * 180) / Math.PI).toFixed(0)}°`)
                  .join(' · ')}
                {'  '}Scale {transform.scale.map((s) => `${(s * 100).toFixed(0)}%`).join(' · ')}
              </div>
            </div>
            <div className="absolute bottom-3 right-3 rounded bg-raised/90 border border-fg2/10 px-3 py-2 text-[10px] text-fg2">
              Drag: rotate view · Right-drag: pan · Wheel: zoom · M/R/S: tools · Esc: deselect
            </div>
          </>
        )}

        {webglError && (
          <div className="absolute inset-0 flex items-center justify-center bg-ground">
            <div className="text-center max-w-md px-6">
              <div className="text-6xl mb-4">⚠️</div>
              <h3 className="text-xl font-semibold text-fg mb-2">3D Preview Unavailable</h3>
              <p className="text-fg2 text-sm">{webglError}</p>
            </div>
          </div>
        )}

        {!webglError && !fileLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-ground/50">
            <div className="text-center">
              <div className="text-6xl mb-4">📦</div>
              <h3 className="text-xl font-semibold text-fg mb-2">
                Load a 3D Model
              </h3>
              <p className="text-fg2">
                Drag and drop an STL or 3MF file, or click "Load Model" to start
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Drag & Drop Overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-0 transition-opacity"
        onDragOver={(e) => {
          e.preventDefault()
          e.currentTarget.classList.remove('opacity-0')
          e.currentTarget.classList.add('opacity-100')
        }}
        onDragLeave={() => {
          const el = event?.currentTarget as HTMLElement
          if (el) {
            el.classList.add('opacity-0')
            el.classList.remove('opacity-100')
          }
        }}
        onDrop={(e) => {
          e.preventDefault()
          const el = e.currentTarget as HTMLElement
          el.classList.add('opacity-0')
          el.classList.remove('opacity-100')

          const file = e.dataTransfer?.files?.[0]
          if (file) {
            const input = document.querySelector(
              'input[type="file"]'
            ) as HTMLInputElement
            const dataTransfer = new DataTransfer()
            dataTransfer.items.add(file)
            input.files = dataTransfer.files
            handleFileLoad({
              target: input,
            } as React.ChangeEvent<HTMLInputElement>)
          }
        }}
      >
        <div className="absolute inset-0 border-2 border-dashed border-ember bg-ember/5 flex items-center justify-center">
          <p className="text-ember font-semibold">Drop model file here</p>
        </div>
      </div>
    </div>
  )
}
