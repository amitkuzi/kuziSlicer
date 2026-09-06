import React, { useState } from 'react'
import type { ConfiguredPrinter } from '../../types/ipc'

/** Native sliced project flow, independent of the editable prototype G-code viewer. */
export function RapidPrinterPanel({ printer, accessCode, serialNumber }: { printer: ConfiguredPrinter; accessCode: string; serialNumber: string }) {
  const [file, setFile] = useState<File | null>(null)
  const [nozzle, setNozzle] = useState(0.4)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const connection = { ip: printer.ipAddress, accessCode: accessCode.trim(), serialNumber: serialNumber.trim(), firmware: 'stock' }
  const execute = async (action: string) => {
    setBusy(true)
    try {
      const invoke = (window as any).electron.invoke
      const base = { extension: 'bambulab-a1-mini', connection }
      if (action === 'print') {
        if (!file || file.size > 64 * 1024 * 1024) throw new Error('Select a sliced project smaller than 64 MiB')
        const result = await invoke('printer:extension-print', { ...base, bytes: new Uint8Array(await file.arrayBuffer()), nozzle })
        setMessage(result.message)
      } else if (action === 'status') {
        const status = await invoke('printer:extension-status', base)
        setMessage(`${status.model}: ${status.state}, ${status.progress}%, nozzle ${status.nozzle} mm, job ${status.job || 'none'}`)
      } else {
        await invoke('printer:extension-control', { ...base, command: action })
        setMessage(`Printer acknowledged ${action}`)
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  return <div className="p-3 border-b border-fg2/10 text-xs space-y-2">
    <div>A1 mini extension · Stock firmware · Original sliced project</div>
    <div className="flex gap-2 flex-wrap items-center">
      <input aria-label="Sliced print project" type="file" accept=".3mf" disabled={busy} onChange={event => setFile(event.target.files?.[0] ?? null)} />
      <label>Nozzle <select aria-label="Installed nozzle" value={nozzle} disabled={busy} onChange={e => setNozzle(Number(e.target.value))}>
        {[0.2, 0.4, 0.6].map(value => <option key={value} value={value}>{value} mm</option>)}
      </select></label>
      {['print', 'status', 'pause', 'resume', 'stop'].map(action => <button key={action} className="px-2 py-1 bg-brass text-base rounded disabled:opacity-50"
        disabled={busy || !printer.ipAddress || !accessCode || !serialNumber || (action === 'print' && !file)} onClick={() => execute(action)}>{action === 'print' ? 'Print project' : action}</button>)}
    </div>
    <div role="status">{busy ? 'Waiting for printer confirmation…' : message}</div>
  </div>
}
