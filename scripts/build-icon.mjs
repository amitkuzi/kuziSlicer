// Rasterises brandkit/icons/kuzislicer/icon.svg into the PNG electron-builder turns into
// the Windows .ico. The committed PNG had lost every foreground shape and was a plain
// dark square, so the packaged app shipped a blank icon; regenerate it from the SVG
// source rather than trusting a hand-exported bitmap.
// Run: node scripts/build-icon.mjs
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const SIZE = 1024
const svgPath = path.resolve('brandkit/icons/kuzislicer/icon.svg')
const outPath = path.resolve('brandkit/icons/kuzislicer/icon-1024.png')
const svg = fs.readFileSync(svgPath, 'utf-8')

// A throwaway Electron entry point: render the SVG at full size, capture, exit.
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'kuzi-icon-'))
fs.writeFileSync(path.join(work, 'icon.svg'), svg)
fs.writeFileSync(path.join(work, 'page.html'),
  `<body style="margin:0;background:transparent"><img src="icon.svg" width="${SIZE}" height="${SIZE}"></body>`)
fs.writeFileSync(path.join(work, 'main.js'), `
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: ${SIZE}, height: ${SIZE}, show: false,
    transparent: true, frame: false, backgroundColor: '#00000000',
    webPreferences: { offscreen: true } })
  await win.loadFile(${JSON.stringify(path.join(work, 'page.html'))})
  await new Promise((r) => setTimeout(r, 600))
  const image = await win.webContents.capturePage()
  fs.writeFileSync(${JSON.stringify(outPath)}, image.toPNG())
  app.quit()
})
`)
fs.writeFileSync(path.join(work, 'package.json'), JSON.stringify({ name: 'kuzi-icon', main: 'main.js' }))

const electron = path.resolve('node_modules/.bin/electron' + (process.platform === 'win32' ? '.cmd' : ''))
const child = spawn(electron, [work], { stdio: 'inherit', shell: process.platform === 'win32' })
child.on('exit', (code) => {
  fs.rmSync(work, { recursive: true, force: true })
  if (code !== 0) { console.error(`electron exited with ${code}`); process.exit(1) }
  const { size } = fs.statSync(outPath)
  console.log(`PASS: wrote ${path.relative(process.cwd(), outPath)} (${SIZE}x${SIZE}, ${(size / 1024).toFixed(1)} KB)`)
})
