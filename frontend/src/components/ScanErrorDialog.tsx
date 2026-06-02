import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { BarcodeCheckResponse } from '../api/harvest'

const REASON_LABELS: Record<string, string> = {
  invalid_format:  'Invalid barcode format',
  already_scanned: 'This sticker has already been scanned',
  never_printed:   'This sticker was never printed',
}

interface Props {
  error:   BarcodeCheckResponse | null
  onClose: () => void
}

export default function ScanErrorDialog({ error, onClose }: Props) {
  useEffect(() => {
    if (!error) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [error, onClose])

  if (!error) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-8">
        <div className="flex justify-center mb-5">
          <div className="w-20 h-20 rounded-full bg-red-50 flex items-center justify-center">
            <AlertTriangle size={40} className="text-red-500" strokeWidth={2} />
          </div>
        </div>
        <div className="text-center mb-6">
          <h2 className="text-2xl font-black text-neutral-900 mb-2">Scan Failed</h2>
          <p className="text-base text-neutral-500">
            {error.reason ? REASON_LABELS[error.reason] ?? error.reason : 'Unknown error'}
          </p>
          {error.scan_date && (
            <p className="text-sm text-neutral-400 mt-2">Previously scanned on {error.scan_date}</p>
          )}
          <p className="font-mono text-sm text-neutral-300 mt-3">{error.barcode}</p>
        </div>
        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600 transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}