import { useState, useEffect, useRef } from 'react'
import { X, Printer } from 'lucide-react'
import JsBarcode from 'jsbarcode'
import { generatePdf } from '../api/printBatches'

interface PrintItem {
  picker_id:   number
  picker_name: string
  quantity:    number
}

interface Props {
  open:      boolean
  onClose:   () => void
  items:     PrintItem[]
  onSuccess: () => void
}

const LABEL_WIDTH_MM  = 97
const LABEL_HEIGHT_MM = 51

// Code128 module count for a 9-char "PPPP-NNNN" string:
//   start(11) + 9 chars × 11 + checksum(11) + stop(13) = 134 modules
// Used to auto-fit bar width to the preview canvas.
const CODE128_MODULES = 134

function padded(n: number, d: number) {
  return String(n).padStart(d, '0')
}

export default function PrintDialog({ open, onClose, items, onSuccess }: Props) {
  const [barcodeScale, setBarcodeScale] = useState(0.8)
  const [isPrinting, setIsPrinting]     = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const previewRef                      = useRef<HTMLCanvasElement>(null)

  const totalStickers = items.reduce((sum, i) => sum + i.quantity, 0)

  // ── Preview canvas ────────────────────────────────────────────────
  // Layout matches server-side: barcode → PPPP-NNNN → name
  useEffect(() => {
    if (!open || !previewRef.current || items.length === 0) return
    const canvas = previewRef.current
    const ctx    = canvas.getContext('2d')
    if (!ctx) return

    const DPI    = 96
    const pxW    = Math.round(LABEL_WIDTH_MM  / 25.4 * DPI)
    const pxH    = Math.round(LABEL_HEIGHT_MM / 25.4 * DPI)
    canvas.width  = pxW
    canvas.height = pxH

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, pxW, pxH)

    const sampleCode = `1234-1234`
    const name       = items[0].picker_name

    const marginPx = Math.round(pxW * 0.03)
    const codeFs   = Math.round(pxH * 0.16)
    const nameFs   = Math.round(pxH * 0.13)

    // Auto-fit bar width to fill the label width (same logic as backend)
    const fullBarW = (pxW - marginPx * 2) / CODE128_MODULES
    const autoBarW = fullBarW * Math.min(barcodeScale, 1.0)

    // Row 1 — barcode (top), height scales with slider
    const bcHeight = Math.round(pxH * 0.52)
    const bc       = document.createElement('canvas')
    JsBarcode(bc, sampleCode, {
      format:       'CODE128',
      width:        autoBarW,
      height:       bcHeight,
      displayValue: false,
      margin:       0,
      background:   '#ffffff',
      lineColor:    '#000000',
    })
    ctx.drawImage(bc, Math.round((pxW - bc.width) / 2), marginPx)

    const bcBottom = marginPx + bcHeight
    const gapPx    = Math.round(pxH * 0.04)

    // Row 2 — code text
    ctx.fillStyle = '#000000'
    ctx.font      = `bold ${codeFs}px "Courier New", monospace`
    ctx.textAlign = 'center'
    ctx.fillText(sampleCode, pxW / 2, bcBottom + gapPx + codeFs)

    // Row 3 — name
    ctx.fillStyle = '#444444'
    ctx.font      = `${nameFs}px Arial, sans-serif`
    ctx.fillText(name, pxW / 2, bcBottom + gapPx + codeFs + gapPx + nameFs)

  }, [open, barcodeScale, items])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  // ── Print ─────────────────────────────────────────────────────────
  const handlePrint = async () => {
    setIsPrinting(true)
    setError(null)

    try {
      const blob = await generatePdf({
        items: items.map(i => ({ picker_id: i.picker_id, quantity: i.quantity })),
        scale: barcodeScale,
      })

      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 10_000)

      onSuccess()
    } catch {
      setError('Failed to generate stickers. Please try again.')
    } finally {
      setIsPrinting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-neutral-100">
          <div>
            <h2 className="text-xl font-black text-neutral-900">Print Stickers</h2>
            <p className="text-sm text-neutral-400 mt-0.5">
              {totalStickers} sticker{totalStickers !== 1 ? 's' : ''} · {items.length} picker{items.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
            <X size={22} />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-5">

          {/* Preview */}
          <div>
            <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">
              Preview — sample sticker
            </p>
            <div className="flex justify-center bg-neutral-50 rounded-xl p-4 border border-neutral-200">
              <canvas
                ref={previewRef}
                className="max-w-full border border-neutral-200 rounded shadow-sm"
                style={{ maxHeight: '160px', width: 'auto' }}
              />
            </div>
          </div>

          {/* Barcode scale */}
          <div>
            <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Barcode Scale</label>
            <div className="mt-2 flex items-center gap-4">
              <input
                type="range" min={0.5} max={1.0} step={0.05}
                value={barcodeScale}
                onChange={e => setBarcodeScale(Number(e.target.value))}
                className="flex-1 accent-primary"
              />
              <span className="text-sm font-bold text-neutral-700 w-8">{barcodeScale}×</span>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm font-medium text-red-700">
              {error}
            </div>
          )}

          {/* Print button */}
          <button
            onClick={handlePrint}
            disabled={isPrinting}
            className="w-full py-4 rounded-xl bg-primary-700 text-white font-bold text-sm hover:bg-primary transition-colors flex items-center justify-center gap-2 disabled:opacity-40 shadow-lg shadow-primary-900/20"
          >
            <Printer size={17} strokeWidth={2.5} />
            {isPrinting ? 'Generating PDF...' : `Open & Print ${totalStickers} Stickers`}
          </button>

        </div>
      </div>
    </div>
  )
}