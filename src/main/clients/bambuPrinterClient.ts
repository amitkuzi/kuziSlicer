/**
 * Bambu Lab LAN-mode print client -- re-exports the printer-extensions implementation.
 * Raw ad-hoc G-code -> synthetic project packaging is deprecated in favor of the
 * `bambulab-a1-mini` rapid printer extension (src/printer-extensions/bambulab-a1-mini),
 * which requires a real BambuStudio/OrcaSlicer-sliced project. See PRD-plugin-platform-v2 §5/§7.
 */
export { default, BambuPrinterClient } from '../../printer-extensions/bambu-legacy/client'
export type { BambuPrintOptions, BambuPrintResult } from '../../printer-extensions/bambu-legacy/client'
