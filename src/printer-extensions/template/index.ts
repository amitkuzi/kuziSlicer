// SPDX-License-Identifier: GPL-3.0-or-later
import { RAPID_PRINTER_EXTENSION, type RapidPrinterExtension } from '../core/types'

/** Copy this directory, implement the two hooks, then run the extension bench. */
export const template: RapidPrinterExtension = {
  manifest: { name: 'printer-template', title: 'Printer extension template', type: RAPID_PRINTER_EXTENSION,
    version: '1.0.0', apiVersion: 1, firmware: [] },
  profiles: [],
  prepare() { throw new Error('Template only: implement package validation before enabling printing') },
  connect() { throw new Error('Template only: implement an abortable transport before enabling printing') },
}
export default template
