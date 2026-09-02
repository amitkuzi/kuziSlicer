import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader'
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'

interface ModelStats {
  vertices: number
  triangles: number
  size: { x: number; y: number; z: number }
}

export const ModelViewer: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const modelRef = useRef<THREE.Group | null>(null)

  const [stats, setStats] = useState<ModelStats | null>(null)
  const [wireframe, setWireframe] = useState(false)
  const [fileLoaded, setFileLoaded] = useState(false)

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
    camera.position.z = 50
    cameraRef.current = camera

    // Renderer
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setSize(canvas.clientWidth, canvas.clientHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
    rendererRef.current = renderer

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(10, 20, 15)
    scene.add(directionalLight)

    // Controls
    const controls = new OrbitControls(camera, canvas)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controlsRef.current = controls

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
    const animate = () => {
      requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      window.removeEventListener('resize', handleResize)
      renderer.dispose()
    }
  }, [])

  // Load model from file
  const handleFileLoad = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !sceneRef.current || !cameraRef.current) return

    try {
      const arrayBuffer = await file.arrayBuffer()
      let model: THREE.Object3D | THREE.Group

      if (file.name.toLowerCase().endsWith('.stl')) {
        const geometry = new STLLoader().parse(arrayBuffer)
        const material = new THREE.MeshPhongMaterial({ color: 0xe4632d })
        const mesh = new THREE.Mesh(geometry, material)
        model = new THREE.Group()
        model.add(mesh)
      } else if (file.name.toLowerCase().endsWith('.3mf')) {
        const result = await new ThreeMFLoader().parseAsync(arrayBuffer)
        model = result
      } else {
        alert('Unsupported file format. Please use .stl or .3mf')
        return
      }

      // Remove previous model
      if (modelRef.current) {
        sceneRef.current.remove(modelRef.current)
      }

      // Add new model
      sceneRef.current.add(model)
      modelRef.current = model as THREE.Group

      // Compute bounding box and center camera
      const bbox = new THREE.Box3().setFromObject(model)
      const size = bbox.getSize(new THREE.Vector3())
      const center = bbox.getCenter(new THREE.Vector3())

      model.position.sub(center)

      const maxDim = Math.max(size.x, size.y, size.z)
      const fov = cameraRef.current.fov * (Math.PI / 180)
      const distance = maxDim / 2 / Math.tan(fov / 2)

      cameraRef.current.position.set(0, 0, distance)
      cameraRef.current.lookAt(0, 0, 0)
      controlsRef.current?.target.set(0, 0, 0)
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
    } catch (error) {
      console.error('Error loading model:', error)
      alert('Failed to load model. Please check the file format.')
    }

    // Reset input
    event.target.value = ''
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

        {fileLoaded && (
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

      {/* Canvas */}
      <div className="flex-1 relative">
        <canvas ref={canvasRef} className="w-full h-full" />

        {!fileLoaded && (
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
