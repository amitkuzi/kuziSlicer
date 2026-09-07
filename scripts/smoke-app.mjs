// Drives the actual running app over the Chrome DevTools Protocol: launches Electron,
// loads a model, slices it and inspects the toolpath preview. Catches the class of
// failure that builds and unit checks cannot -- a renderer that never paints.
// Run: node scripts/smoke-app.mjs
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// A fixed port let this run attach to a *stale* Electron left over from an earlier run
// and report its state as ours. Unique port + throwaway profile per run instead.
const PORT = 9223 + (process.pid % 300)
const USER_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'kuzi-smoke-profile-'))
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

const child = spawn(electron, ['.', `--remote-debugging-port=${PORT}`, `--user-data-dir=${USER_DATA}`], {
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
  // On a fresh profile the wizard can mount after the splash clears, so keep trying.
  for (let attempt = 0; attempt < 15; attempt++) {
    const gone = await cdp.evaluate(`
      const skip = [...document.querySelectorAll('button')].find(b => /skip/i.test(b.textContent))
      if (skip) { skip.click(); return false }
      return true
    `)
    if (gone && attempt > 0) break
    await sleep(500)
  }

  // 3. Switch to Advanced mode so every control is on screen. The first-run wizard can
  // still be clearing, so retry until the mode toggle is actually reachable.
  let inAdvanced = false
  for (let attempt = 0; attempt < 10 && !inAdvanced; attempt++) {
    inAdvanced = await cdp.evaluate(`
      const adv = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Advanced')
      if (!adv) return false
      if (adv.getAttribute('aria-pressed') !== 'true') adv.click()
      return true
    `)
    if (!inAdvanced) await sleep(600)
  }
  check(inAdvanced, 'advanced mode reachable')
  await sleep(800)

  // 4. Infill pattern selector is populated from the registry over IPC.
  const infill = await cdp.evaluate(`
    const patterns = await window.electron.invoke('gcode:infill-patterns')
    const labels = [...document.querySelectorAll('label')].map(l => l.textContent.trim())
    return {
      count: patterns.length,
      ids: patterns.map(p => p.id),
      hasField: labels.some(l => /Infill Pattern/i.test(l)),
      labels: labels.slice(0, 12),
    }
  `)
  check(infill.count >= 5, 'infill registry exposed over IPC', infill.ids.join(', '))
  check(infill.hasField, 'infill pattern selector rendered in the sidebar', infill.hasField ? '' : `visible labels: ${infill.labels.join(' | ')}`)

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

  // 8b. A slice reports progress to the UI instead of silently freezing it.
  const banner = await cdp.evaluate(`
    const printers = await window.electron.invoke('gcode:printers')
    const filaments = await window.electron.invoke('gcode:filaments')
    const seen = []
    const job = window.electron.invoke('gcode:generate', ${JSON.stringify(modelPath)},
      printers[0].name, filaments[0].name,
      { layerHeight: 0.1, infillDensity: 40, infillPattern: 'gyroid', shellThickness: 1.2, supportEnabled: false, fanSpeed: 100 },
      { position: [0,0,0], rotation: [0,0,0], scale: [1,1,1] })
    for (let i = 0; i < 60; i++) {
      const el = document.querySelector('[role=status]')
      if (el) seen.push(el.innerText.replace(/\\s+/g, ' ').trim())
      await new Promise(r => setTimeout(r, 100))
      if (seen.length && !document.querySelector('[role=status]')) break
    }
    await job
    await new Promise(r => setTimeout(r, 500))
    return { seen, cleared: !document.querySelector('[role=status]') }
  `)
  check(banner.seen.length > 0, 'the busy indicator appears while slicing', banner.seen[0] || 'never appeared')
  check(banner.seen.some(t => /%/.test(t)), 'it reports real percentage progress', banner.seen.filter(t => /%/.test(t)).slice(-1)[0] || 'no percentage')
  check(banner.cleared, 'the busy indicator clears when the slice finishes')

  // 9. The sidebar width handle actually resizes the panel and remembers it.
  const resize = await cdp.evaluate(`
    const aside = document.querySelector('aside')
    const handle = document.querySelector('[role=separator][aria-label="Resize settings panel"]')
    if (!aside || !handle) return { ok: false, reason: 'resize handle not found' }
    const before = aside.getBoundingClientRect().width
    handle.focus()
    for (let i = 0; i < 3; i++) {
      handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    }
    await new Promise(r => setTimeout(r, 300))
    return {
      ok: true,
      before,
      after: document.querySelector('aside').getBoundingClientRect().width,
      stored: localStorage.getItem('panelWidth'),
    }
  `)
  check(resize.ok && resize.after > resize.before, 'sidebar resize handle widens the panel', `${resize.before} → ${resize.after}`)

  // A pointer drag must end when the button is released -- a stuck listener would keep
  // resizing on plain mouse moves afterwards, which is exactly what pointer capture prevents.
  const drag = await cdp.evaluate(`
    const handle = document.querySelector('[role=separator][aria-label="Resize settings panel"]')
    const aside = document.querySelector('aside')
    const send = (type, x) => handle.dispatchEvent(new PointerEvent(type, {
      pointerId: 1, clientX: x, clientY: 300, bubbles: true, cancelable: true, isPrimary: true,
    }))
    send('pointerdown', handle.getBoundingClientRect().x)
    send('pointermove', 420)
    await new Promise(r => setTimeout(r, 200))
    const dragged = aside.getBoundingClientRect().width
    send('pointerup', 420)
    await new Promise(r => setTimeout(r, 100))
    send('pointermove', 250) // no button held: must be ignored
    await new Promise(r => setTimeout(r, 200))
    return { dragged, afterRelease: aside.getBoundingClientRect().width }
  `)
  check(Math.round(drag.dragged) === 420, 'pointer drag resizes the panel', `width ${drag.dragged}`)
  check(drag.afterRelease === drag.dragged, 'the drag stops on pointerup', `width drifted to ${drag.afterRelease}`)

  // 10. Clicking a configured printer opens its own tab with the printer's web UI.
  const added = await cdp.evaluate(`
    const models = await window.electron.invoke('gcode:printers')
    await window.electron.invoke('printer:configured:add', {
      name: 'Smoke Printer', model: models[0].id, ipAddress: '127.0.0.1', port: '8099',
    })
    const list = await window.electron.invoke('printer:configured:list')
    return { count: list.length, name: list[0] && list[0].name, width: localStorage.getItem('panelWidth') }
  `)
  check(added.count === 1 && added.name === 'Smoke Printer', 'test printer persisted over IPC', `${added.count} configured`)
  await cdp.send('Page.reload')
  await sleep(4000)

  // Survives a reload: this is what "persisted" actually has to mean.
  const restored = await cdp.evaluate(`
    return { width: document.querySelector('aside').getBoundingClientRect().width }
  `)
  check(restored.width === Number(added.width), 'panel width restored after reload', `${restored.width} vs stored ${added.width}`)

  const printerTab = await cdp.evaluate(`
    const tab = [...document.querySelectorAll('button')].find(b => /Printer Management/.test(b.textContent))
    if (!tab) return { ok: false, reason: 'printer management tab missing' }
    tab.click()
    await new Promise(r => setTimeout(r, 600))
    // The clickable card itself, not an ancestor container that merely contains its text.
    const card = [...document.querySelectorAll('div.cursor-pointer')].find(d => /Smoke Printer/.test(d.textContent))
    if (!card) return { ok: false, reason: 'printer card missing' }
    card.click()
    await new Promise(r => setTimeout(r, 600))
    const frame = document.querySelector('iframe')
    return {
      ok: true,
      src: frame ? frame.getAttribute('src') : null,
      visible: frame ? !frame.closest('.hidden') : false,
      closable: !!document.querySelector('[aria-label="Close Smoke Printer"]'),
    }
  `)
  check(printerTab.ok, 'printer card reachable', printerTab.reason || '')
  check(printerTab.src === 'http://127.0.0.1:8099/', 'printer tab hosts the printer web UI', `src ${printerTab.src}`)
  check(printerTab.visible, 'the printer tab is the visible one after clicking the card')
  check(printerTab.closable, 'printer tab has a close button')

  const closed = await cdp.evaluate(`
    document.querySelector('[aria-label="Close Smoke Printer"]').click()
    await new Promise(r => setTimeout(r, 400))
    return {
      frames: document.querySelectorAll('iframe').length,
      tabStillThere: !!document.querySelector('[aria-label="Close Smoke Printer"]'),
    }
  `)
  check(closed.frames === 0 && !closed.tabStillThere, 'closing the printer tab removes tab and frame', `${closed.frames} iframes, tab present: ${closed.tabStillThere}`)

  // A renamed printer must not leave a tab labelled with the old name framing the old IP.
  const renamed = await cdp.evaluate(`
    const card = [...document.querySelectorAll('div.cursor-pointer')].find(d => /Smoke Printer/.test(d.textContent))
    card.click()
    await new Promise(r => setTimeout(r, 500))
    // Rename it the way a user would: the Edit button on the card, then Update.
    const mgmt = [...document.querySelectorAll('button')].find(b => /^Printer Management$/.test(b.textContent.trim()))
    mgmt.click()
    await new Promise(r => setTimeout(r, 400))
    const edit = [...document.querySelectorAll('div.cursor-pointer')]
      .find(d => /Smoke Printer/.test(d.textContent))
      .querySelector('button')
    edit.click()
    await new Promise(r => setTimeout(r, 400))
    const nameInput = document.querySelector('input[name=name]')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(nameInput, 'Renamed Printer')
    nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise(r => setTimeout(r, 200))
    ;[...document.querySelectorAll('button')].find(b => /Update Printer/.test(b.textContent)).click()
    await new Promise(r => setTimeout(r, 900))
    return {
      staleTab: !!document.querySelector('[aria-label="Close Smoke Printer"]'),
      freshTab: !!document.querySelector('[aria-label="Close Renamed Printer"]'),
    }
  `)
  check(!renamed.staleTab && renamed.freshTab, 'an open printer tab follows a rename', `stale: ${renamed.staleTab}, fresh: ${renamed.freshTab}`)

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
  try { fs.rmSync(USER_DATA, { recursive: true, force: true }) } catch { /* electron still exiting */ }
}

console.log(failures === 0 ? '\nPASS: app smoke test' : `\nFAIL: ${failures} smoke check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
