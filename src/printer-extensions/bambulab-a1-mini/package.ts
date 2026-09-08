/**
 * Package kuziSlicer G-code into a Bambu `.gcode.3mf` project the A1 mini firmware accepts.
 *
 * The A1 mini will not print bare Marlin G-code: it needs its own start sequence (bed
 * detect, nozzle wipe, ABL, extrusion calibration) and end sequence, plus the project
 * metadata the firmware reads before it will accept `project_file`. All of that already
 * exists, fully expanded, inside a genuine BambuStudio A1 mini export -- so this reuses
 * the bundled template as the source of truth and swaps in our toolpaths, rather than
 * re-deriving Bambu's macros from the preset JSON.
 *
 * ponytail: the template is a 0.4 nozzle / Textured PEI export, so only that combination
 * is supported. Add a second template export if 0.2/0.6 nozzles are ever needed.
 */
import * as fs from 'fs'
import * as path from 'path'
import { createHash } from 'crypto'
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate'

const PLATE = 'Metadata/plate_1.gcode'
const FILAMENT_DIAMETER = 1.75
const PLA_DENSITY = 1.24

/** The slicer release the reused CONFIG_BLOCK came from, so a reader can interpret it. */
function templateVersion(config: string[]): string {
  const declared = config.find((line) => /^; version = /.test(line))?.split('= ')[1]?.trim()
  return declared || '02.05.00.66'
}

export interface BambuPackageOptions {
  readonly nozzleTemp: number
  readonly bedTemp: number
  readonly nozzle: number
  readonly objectName: string
}

/**
 * Where the job actually prints, measured from the toolpaths themselves rather than passed
 * in alongside them -- the bed levelling area and the end-of-print Z lift have to match the
 * moves that are really in the file, not what a caller believed it placed.
 */
function extrusionBounds(body: string[]) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, maxZ = 0
  let x = 0, y = 0
  for (const line of body) {
    const z = line.match(/^G1 Z([\d.]+)/)
    if (z) { maxZ = Math.max(maxZ, Number(z[1])); continue }
    const move = line.match(/^G[01] X(-?[\d.]+) Y(-?[\d.]+)(.*)$/)
    if (!move) continue
    const nx = Number(move[1]), ny = Number(move[2])
    if (/\bE\d|\bE\./.test(move[3])) {
      for (const [px, py] of [[x, y], [nx, ny]]) {
        minX = Math.min(minX, px); maxX = Math.max(maxX, px)
        minY = Math.min(minY, py); maxY = Math.max(maxY, py)
      }
    }
    x = nx; y = ny
  }
  return { minX, maxX, minY, maxY, maxZ }
}

function templatePath(): string {
  const dev = path.join(process.cwd(), 'src', 'printer-extensions', 'bambu-legacy', 'template.gcode.3mf')
  return fs.existsSync(dev)
    ? dev
    : path.join(process.resourcesPath || process.cwd(), 'printer-extensions', 'bambu-legacy', 'template.gcode.3mf')
}

/** Slice the template's plate G-code into the machine blocks we reuse verbatim. */
function templateBlocks(lines: string[]) {
  const at = (marker: string, from = 0) => {
    const index = lines.indexOf(marker, from)
    if (index < 0) throw new Error(`Template G-code is missing ${marker}`)
    return index
  }
  const configStart = at('; CONFIG_BLOCK_START')
  const configEnd = at('; CONFIG_BLOCK_END', configStart)
  const execStart = at('; EXECUTABLE_BLOCK_START', configEnd)
  const firstLayer = at('; CHANGE_LAYER', execStart)
  const endStart = lines.lastIndexOf('; MACHINE_END_GCODE_START')
  if (endStart < firstLayer) throw new Error('Template G-code is missing ; MACHINE_END_GCODE_START')
  return {
    config: lines.slice(configStart, configEnd + 1),
    // Machine start gcode + the filament start gcode that follows it.
    start: lines.slice(execStart, firstLayer),
    end: lines.slice(endStart),
  }
}

/**
 * Rewrite kuziSlicer's G-code body for the Bambu flavour: drop our own init and shutdown
 * (the machine blocks own those) and translate layer markers into the firmware's progress
 * notifications so the printer's own progress bar tracks the job.
 */
// Bambu/OrcaSlicer's own G-code viewer keys its Preview tab off these exact comments: it
// segments "prepare" from "printing" at "; CHANGE_LAYER" (without it, Bambu Studio timed
// our whole file as prepare and showed "Model printing time: 0s" -- an empty plate is the
// visible symptom, not a separate bug), and colours moves by "; FEATURE: <name>", not the
// Cura/Prusa-style ";TYPE:" tags kuziSlicer's own G-code viewer uses elsewhere.
const FEATURE_BY_TYPE: Record<string, string> = {
  'WALL-OUTER': 'Outer wall', 'WALL-INNER': 'Inner wall',
  SKIN: 'Top surface', FILL: 'Sparse infill', SUPPORT: 'Support',
}

function bambuBody(gcode: string, lineWidth: number, objectId: string): { body: string[]; layers: number } {
  const lines = gcode.split(/\r?\n/)
  const layerHeight = Number(gcode.match(/^; Layer Height: ([\d.]+)mm$/m)?.[1])
  if (!(layerHeight > 0)) throw new Error('G-code header has no layer height')
  const first = lines.findIndex((line) => /^; Layer 1\/\d+$/.test(line))
  if (first < 0) throw new Error('G-code has no layer markers; nothing to package')
  const last = lines.findIndex((line) => line === '; End of print')
  const kept = lines.slice(first, last < 0 ? undefined : last)
  // Layers with no cross-section are dropped by the slicer, so number the markers by what
  // is actually emitted -- otherwise the printer's progress bar never reaches the end.
  const layers = kept.filter((line) => /^; Layer \d+\/\d+$/.test(line)).length
  const body: string[] = []
  let index = 0
  for (let i = 0; i < kept.length; i++) {
    const line = kept[i]
    const layerMarker = line.match(/^; Layer (\d+)\/\d+$/)
    const type = line.match(/^;TYPE:([\w-]+)$/)
    if (type) {
      const feature = FEATURE_BY_TYPE[type[1]]
      // LINE_WIDTH is how the viewer knows how wide to draw (and how much material a move
      // lays down); every extrusion run in a real Bambu file carries one.
      if (feature) body.push(`; FEATURE: ${feature}`, `; LINE_WIDTH: ${lineWidth}`)
      body.push(line)
      continue
    }
    if (!layerMarker) {
      body.push(line)
      continue
    }
    index++
    // The Z move always immediately follows the layer marker (see GcodeEngine.generate).
    const z = kept[i + 1]?.match(/^G1 Z([\d.]+) F600$/)?.[1] ?? '0'
    // OBJECT_ID ties each layer's moves back to the object declared in slice_info.config;
    // without it the viewer has no object to attribute the layer to.
    body.push('; CHANGE_LAYER', `; Z_HEIGHT: ${z}`, `; LAYER_HEIGHT: ${layerHeight}`,
      `; layer num/total_layer_count: ${index}/${layers}`, `M73 L${index}`,
      `M991 S0 P${index - 1} ;notify layer change`, `; OBJECT_ID: ${objectId}`)
  }
  return { body, layers }
}

export function buildProject(gcode: string, options: BambuPackageOptions): Buffer {
  if (options.nozzle !== 0.4) throw new Error('Bambu packaging currently supports the 0.4 mm nozzle only')
  if (!(options.nozzleTemp > 0 && options.nozzleTemp <= 300) || !(options.bedTemp > 0 && options.bedTemp <= 80)) {
    throw new Error('Nozzle or bed temperature is outside the A1 mini limits')
  }

  const entries = unzipSync(new Uint8Array(fs.readFileSync(templatePath())))
  if (!entries[PLATE]) throw new Error(`Template package is missing ${PLATE}`)
  const blocks = templateBlocks(strFromU8(entries[PLATE]).split(/\r?\n/))
  // The G-code's OBJECT_ID has to be the id slice_info.config declares, or the viewer
  // attributes the layers to an object it never heard of.
  const sliceInfo = entries['Metadata/slice_info.config'] ? strFromU8(entries['Metadata/slice_info.config']) : ''
  const objectId = sliceInfo.match(/<object identify_id="(\d+)"/)?.[1]
  if (!objectId) throw new Error('Template slice_info.config declares no object id')
  const { body, layers } = bambuBody(gcode, options.nozzle, objectId)

  const bounds = extrusionBounds(body)
  if (!(bounds.maxZ > 0 && bounds.maxZ <= 180) || !(bounds.maxX > bounds.minX) || !(bounds.maxY > bounds.minY)) {
    throw new Error('Toolpaths are empty or exceed the A1 mini build volume')
  }
  if (bounds.minX < 0 || bounds.maxX > 180 || bounds.minY < 0 || bounds.maxY > 180) {
    throw new Error('Toolpaths fall outside the A1 mini bed; reposition or scale the model')
  }

  // The start block was expanded for the template's own object and filament; retarget the
  // parts that are geometry- or material-dependent.
  const start = blocks.start.map((line) =>
    line
      // Bambu indents the levelling call inside its M622 guard, so keep the leading blanks.
      .replace(/^(\s*)G29 A1 X[\d.-]+ Y[\d.-]+ I[\d.-]+ J[\d.-]+/,
        `$1G29 A1 X${bounds.minX.toFixed(3)} Y${bounds.minY.toFixed(3)} ` +
        `I${(bounds.maxX - bounds.minX).toFixed(3)} J${(bounds.maxY - bounds.minY).toFixed(3)}`)
      .replace(/^(\s*M10[49] S)(?:220|250)\b/, `$1${options.nozzleTemp}`)
      .replace(/^(\s*M1[49]0 S)65\b/, `$1${options.bedTemp}`)
  )

  const end = blocks.end.map((line) =>
    line
      .replace(/^G1 Z[\d.]+ F900 ; lower z a little/, `G1 Z${Math.min(180, bounds.maxZ + 0.5).toFixed(2)} F900 ; lower z a little`)
      .replace(/^G1 X0 Y[\d.]+ F18000 ; move to safe pos/,
        `G1 X0 Y${((bounds.minY + bounds.maxY) / 2).toFixed(3)} F18000 ; move to safe pos`)
  )

  // A real export's header carries the filament totals and the version of the profile the
  // file was built against; the viewer reads these before it looks at a single move. The
  // version line names the BambuStudio release whose CONFIG_BLOCK we reuse verbatim, which
  // is what a reader needs in order to interpret the settings below it.
  // Only extrusion along a real XY move lays material down; an E-only move is the prime
  // that pairs with a retraction and nets to nothing.
  const filamentMm = body.reduce((sum, line) => {
    const e = line.match(/^G[01]\s+X-?[\d.]+\s+Y-?[\d.]+[^;]*?\sE(\d[\d.]*)/)
    return e ? sum + Number(e[1]) : sum
  }, 0)
  const volumeCm3 = (filamentMm * Math.PI * (FILAMENT_DIAMETER / 2) ** 2) / 1000
  const plate = [
    '; HEADER_BLOCK_START',
    `; BambuStudio ${templateVersion(blocks.config)}`,
    '; kuziSlicer',
    `; total layer number: ${layers}`,
    `; total filament length [mm] : ${filamentMm.toFixed(2)}`,
    `; total filament volume [cm^3] : ${volumeCm3.toFixed(2)}`,
    `; total filament weight [g] : ${(volumeCm3 * PLA_DENSITY).toFixed(2)}`,
    `; filament_density: ${PLA_DENSITY}`,
    `; filament_diameter: ${FILAMENT_DIAMETER}`,
    `; max_z_height: ${bounds.maxZ.toFixed(2)}`,
    '; filament: 1',
    '; HEADER_BLOCK_END',
    '',
    ...blocks.config,
    '',
    ...start,
    ...body,
    'M981 S0 P20000 ; close spaghetti detector',
    ...end,
  ].join('\n')

  entries[PLATE] = strToU8(plate)
  entries[`${PLATE}.md5`] = strToU8(createHash('md5').update(plate, 'utf-8').digest('hex').toUpperCase())
  const info = 'Metadata/slice_info.config'
  if (entries[info]) {
    entries[info] = strToU8(
      strFromU8(entries[info]).replace(/(<object identify_id="\d+" name=")[^"]*(")/,
        `$1${options.objectName.replace(/[^\w. -]/g, '_')}$2`)
    )
  }
  return Buffer.from(zipSync(entries, { level: 6 }))
}

export default buildProject
