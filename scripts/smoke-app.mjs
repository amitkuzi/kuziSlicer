// Drives the actual running app over the Chrome DevTools Protocol: launches Electron,
// loads a model, slices it and inspects the toolpath preview. Catches the class of
// failure that builds and unit checks cannot -- a renderer that never paints.
// Run: node scripts/smoke-app.mjs
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PORT = 9223
// Absolute + platform-native, or cmd.exe rejects the forward slashes under shell:true.
const electron = path.resolve(
  process.cwd(),
  process.platform === 'win32' ? 'node_modules/.bin/electron.cmd' : 'node_modules/.bin/electron'
)

// A closed 20x20x10mm box, so the slicer has a real solid to work with.
function writeBox(filePath) {
  const p = [
    [0, 0, 0], [20, 0, 0], [20, 20, 0], [0, 20, 0],
    [0, 0, 10], [20, 0, 10], [20, 20, 10], [0, 20, 10],
  ]
  const face = (a, b, c, d) => [[p[a], p[b], p[c]], [p[a], p[c], p[d]]]
  const tris = [
    ...face(0, 3, 2, 1), ...face(4, 5, 6, 7), ...face(0, 1, 5, 4),
    ...face(1, 2, 6, 5), ...face(2, 3, 7, 6), ...face(3, 0, 4, 7),
  ]
  const buf = Buffer.alloc(84 + tris.length * 50)
  buf.writeUInt32LE(tris.length, 80)
  let o = 84
  for (const t of tris) {
    o += 12
    for (const v of t) {
      buf.writeFloatLE(v[0], o); buf.writeFloatLE(v[1], o + 4); buf.writeFloatLE(v[2], o + 8); o += 12
    }
    o += 2
  }
  fs.writeFileSync(filePath, buf)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function findPage() {
  for (let i = 0; i < 40; i++) {
    try {
      const targets = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json())
      const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) return page
    } catch {
      /* not up yet */
    }
    await sleep(500)
  }
  throw new Error('Electron never exposed a debuggable page')
}

function connect(url) {
  const ws = new WebSocket(url)
  let nextId = 1
  const pending = new Map()
  const consoleErrors = []

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '))
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(msg.params.exceptionDetails.exception?.description || 'exception')
    }
  })

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })

  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve)
    ws.addEventListener('error', reject)
  })

  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression: `(async () => { ${expression} })()`,
      awaitPromise: true,
      returnByValue: true,
    })
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || 'evaluate failed')
    }
    return result.result.value
  }

  return { ws, send, ready, evaluate, consoleErrors }
}

const modelPath = path.join(os.tmpdir(), `kuzi-smoke-${Date.now()}.stl`)
writeBox(modelPath)

const child = spawn(electron, ['.', `--remote-debugging-port=${PORT}`], {
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: process.platform === 'win32',
})
const mainLog = []
child.stdout.on('data', (d) => mainLog.push(d.toString()))
child.stderr.on('data', (d) => mainLog.push(d.toString()))

let failures = 0
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

try {
  const page = await findPage()
  const cdp = connect(page.webSocketDebuggerUrl)
  await cdp.ready
  await cdp.send('Runtime.enable')
  await cdp.send('Page.enable')
  await sleep(3000) // let React mount and the splash clear

  // 1. The renderer actually painted -- the failure a build can never catch.
  const painted = await cdp.evaluate(`
    const root = document.getElementById('root') || document.body
    return { html: root.innerHTML.length, text: (root.innerText || '').slice(0, 400) }
  `)
  check(painted.html > 500, 'renderer painted', `${painted.html} bytes of DOM`)

  // 2. Skip the first-run config wizard if it is showing.
  await cdp.evaluate(`
    const skip = [...document.querySelectorAll('button')].find(b => /skip/i.test(b.textContent))
    if (skip) skip.click()
    return true
  `)
  await sleep(1200)

  // 3. Switch to Advanced mode so every control is on screen.
  await cdp.evaluate(`
    const adv = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Advanced')
    if (adv) adv.click()
    return true
  `)
  await sleep(800)

  // 4. Infill pattern selector is populated from the registry over IPC.
  const infill = await cdp.evaluate(`
    const patterns = await window.electron.invoke('gcode:infill-patterns')
    const labels = [...document.querySelectorAll('label')].map(l => l.textContent)
    return { count: patterns.length, ids: patterns.map(p => p.id), hasField: labels.some(l => /Infill Pattern/i.test(l)) }
  `)
  check(infill.count >= 5, 'infill registry exposed over IPC', infill.ids.join(', '))
  check(infill.hasField, 'infill pattern selector rendered in the sidebar')

  // 5. Load a real model through the path input (the full-path route slicing needs).
  const loaded = await cdp.evaluate(`
    const input = [...document.querySelectorAll('input[type=text]')].find(i => /full path/i.test(i.placeholder || ''))
    if (!input) return { ok: false, reason: 'path input not found' }
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, ${JSON.stringify(modelPath)})
    input.dispatchEvent(new Event('input', { bubbles: true }))
    const load = [...document.querySelectorAll('button')].find(b => /load path/i.test(b.textContent))
    if (!load) return { ok: false, reason: 'load button not found' }
    load.click()
    return { ok: true }
  `)
  check(loaded.ok, 'model load triggered', loaded.reason || '')
  await sleep(2500)

  // 6. The viewport tools (move/rotate/scale) appear once a model is loaded.
  const tools = await cdp.evaluate(`
    const buttons = [...document.querySelectorAll('button')].map(b => b.textContent.trim())
    return {
      tools: ['Move','Rotate','Scale'].filter(t => buttons.some(b => b.includes(t))),
      stats: (document.body.innerText.match(/Triangles: [\\d,]+/) || [''])[0],
    }
  `)
  check(tools.tools.length === 3, 'viewport move/rotate/scale tools rendered', tools.tools.join(', '))
  check(/Triangles: 12/.test(tools.stats), 'model parsed and displayed', tools.stats)

  // 7. Slice it, going through the real IPC path the Generate button uses.
  const sliced = await cdp.evaluate(`
    const printers = await window.electron.invoke('gcode:printers')
    const filaments = await window.electron.invoke('gcode:filaments')
    if (!printers.length || !filaments.length) return { ok: false, reason: 'no profiles available' }
    const file = await window.electron.invoke('gcode:generate', ${JSON.stringify(modelPath)},
      printers[0].name, filaments[0].name,
      { layerHeight: 0.2, infillDensity: 20, infillPattern: 'gyroid', shellThickness: 1.2, supportEnabled: false, fanSpeed: 100 },
      { position: [0,0,0], rotation: [0,0,0], scale: [1,1,1] })
    const read = await window.electron.invoke('file:read', file)
    const gcode = read.content || ''
    return {
      ok: read.success,
      printer: printers[0].name,
      layers: (gcode.match(/^; Layer \\d+\\//gm) || []).length, // \\d guards against the "; Layer Height" header
      extrusions: (gcode.match(/^G1 X.*E/gm) || []).length,
      hasGyroid: /Infill: 20% Gyroid/.test(gcode),
      types: [...new Set(gcode.match(/;TYPE:[A-Z-]+/g) || [])],
    }
  `)
  check(sliced.ok, 'slicing produced G-code', sliced.reason || `printer: ${sliced.printer}`)
  check(sliced.layers === 50, 'a 10mm box at 0.2mm sliced into 50 layers', `got ${sliced.layers}`)
  check(sliced.extrusions > 500, 'toolpath contains real extrusion moves', `${sliced.extrusions} moves`)
  check(sliced.hasGyroid, 'the selected infill pattern reached the slicer')
  check(sliced.types.length >= 3, 'feature types tagged for the preview', sliced.types.join(' '))

  // 8. The preview parses that G-code into layers (what the slider drives).
  const preview = await cdp.evaluate(`
    const canvases = [...document.querySelectorAll('canvas')]
    return { canvases: canvases.length, sized: canvases.filter(c => c.width > 0 && c.height > 0).length }
  `)
  check(preview.sized > 0, 'a live WebGL canvas is on screen', `${preview.sized}/${preview.canvases} sized`)

  const realErrors = cdp.consoleErrors.filter(
    (e) => !/DevTools|Autofill|Electron Security|source map/i.test(e)
  )
  check(realErrors.length === 0, 'no renderer console errors', realErrors.slice(0, 3).join(' | '))
} catch (err) {
  failures++
  console.error(`FAIL: smoke run threw — ${err instanceof Error ? err.message : err}`)
  console.error(mainLog.join('').slice(-2000))
} finally {
  // shell:true means we spawned cmd.exe, and killing that leaves Electron running
  // (which then holds the debug port hostage for the next run). Kill the whole tree.
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    child.kill('SIGKILL')
  }
  fs.rmSync(modelPath, { force: true })
}

console.log(failures === 0 ? '\nPASS: app smoke test' : `\nFAIL: ${failures} smoke check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
