import { RAPID_PRINTER_EXTENSION, type RapidPrinterExtension } from '../core/types'
import { profiles } from './profiles'
import { prepare } from './prepare'
import { BambuTransport } from './transport'

export const a1Mini: RapidPrinterExtension = {
  manifest: { name: 'bambulab-a1-mini', title: 'Bambu Lab A1 mini', type: RAPID_PRINTER_EXTENSION,
    version: '1.0.0', apiVersion: 1, firmware: ['stock'] },
  profiles, prepare, connect: connection => new BambuTransport(connection),
}
export default a1Mini
