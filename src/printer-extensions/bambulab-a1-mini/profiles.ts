import type { PrinterProfile } from '../../main/services/gcodeGenerator'

/** Machine limits from Bambu's A1 mini specification; slicing presets live in native/. */
export const profiles: PrinterProfile[] = [0.2, 0.4, 0.6].map(nozzleSize => ({
  id: nozzleSize === 0.4 ? 'bambulab-a1-mini' : `bambulab-a1-mini-${nozzleSize}`,
  name: nozzleSize === 0.4 ? 'Bambu Lab A1 Mini' : `Bambu Lab A1 Mini (${nozzleSize} mm)`,
  nozzleSize, bedSizeX: 180, bedSizeY: 180, bedSizeZ: 180, maxTemp: 300,
  maxBedTemp: 80, maxSpeed: 500, defaultSpeed: 200, acceleration: 10000,
}))
