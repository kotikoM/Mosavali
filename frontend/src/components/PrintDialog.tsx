// components/PrintDialog.tsx — full rewrite
import { useState, useMemo, useEffect, useRef } from 'react'
import { X, Printer } from 'lucide-react'
import { jsPDF } from 'jspdf'
import JsBarcode from 'jsbarcode'

interface PrintBatch {
  batch_id:        number
  picker_id:       number
  picker_name:     string
  box_number_from: number
  box_number_to:   number
  quantity:        number
  printed_at:      string
}

interface Props {
  open:    boolean
  onClose: () => void
  batches: PrintBatch[]
}

const LABEL_WIDTH_MM = 97
const LABEL_HEIGHT_MM = 51   // fixed

function padded(n: number, d: number) {
  return String(n).padStart(d, '0')
}

interface StickerItem { code: string; name: string }

function buildItems(batches: PrintBatch[]): StickerItem[] {
  const out: StickerItem[] = []
  for (const b of batches) {
    for (let i = b.box_number_from; i <= b.box_number_to; i++) {
      out.push({
        code: `${padded(b.picker_id, 4)}-${padded(i, 4)}`,
        name: b.picker_name,
      })
    }
  }
  return out
}

export default function PrintDialog({ open, onClose, batches }: Props) {
  const [barcodeScale, setBarcodeScale] = useState(2)
  const [isGenerating, setIsGenerating] = useState(false)
  const previewRef                      = useRef<HTMLCanvasElement>(null)
  const totalStickers                   = batches.reduce((s, b) => s + b.quantity, 0)
  const items                           = useMemo(() => buildItems(batches), [batches])

  // ── Preview ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open || !previewRef.current || items.length === 0) return
    const canvas = previewRef.current
    const ctx    = canvas.getContext('2d')
    if (!ctx) return

    const DPI = 96
    const pxW = Math.round(LABEL_WIDTH_MM  / 25.4 * DPI)
    const pxH = Math.round(LABEL_HEIGHT_MM / 25.4 * DPI)
    canvas.width  = pxW
    canvas.height = pxH

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, pxW, pxH)

    const { code, name } = items[0]

    const bc = document.createElement('canvas')
    JsBarcode(bc, code, {
      format: 'CODE128', width: barcodeScale,
      height: Math.round(pxH * 0.50),
      displayValue: false, margin: 0,
      background: '#ffffff', lineColor: '#000000',
    })
    const bx = Math.round((pxW - bc.width) / 2)
    const by = Math.round(pxH * 0.06)
    ctx.drawImage(bc, bx, by)

    const bot     = by + bc.height
    const codeFs  = Math.round(pxH * 0.12)
    const nameFs  = Math.round(pxH * 0.10)

    ctx.fillStyle = '#000000'
    ctx.font      = `bold ${codeFs}px monospace`
    ctx.textAlign = 'center'
    ctx.fillText(code, pxW / 2, bot + codeFs + 4)

    ctx.fillStyle = '#444444'
    ctx.font      = `${nameFs}px sans-serif`
    ctx.fillText(name, pxW / 2, bot + codeFs + nameFs + 10)

  }, [open, barcodeScale, items])

  // ── PDF ───────────────────────────────────────────────────────────────
  const generatePDF = () => {
    const PX  = 3.78 * 3   // ~288 DPI for sharp print
    const lWm = LABEL_WIDTH_MM
    const lHm = LABEL_HEIGHT_MM
    const lW  = Math.round(lWm * PX)
    const lH  = Math.round(lHm * PX)

    const doc = new jsPDF({
      orientation: 'landscape',
      unit:        'mm',
      format:      [lWm, lHm],
    })

    items.forEach(({ code, name }, idx) => {
      if (idx > 0) doc.addPage([lWm, lHm], 'landscape')

      const lc  = document.createElement('canvas')
      lc.width  = lW
      lc.height = lH
      const ctx = lc.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, lW, lH)

      const bc = document.createElement('canvas')
      JsBarcode(bc, code, {
        format: 'CODE128', width: barcodeScale * 3,
        height: Math.round(lH * 0.50),
        displayValue: false, margin: 0,
        background: '#ffffff', lineColor: '#000000',
      })
      ctx.drawImage(bc, (lW - bc.width) / 2, Math.round(lH * 0.06))

      const bot    = Math.round(lH * 0.06) + bc.height
      const codeFs = Math.round(lH * 0.12)
      const nameFs = Math.round(lH * 0.10)

      ctx.font      = `bold ${codeFs}px "Courier New", monospace`
      ctx.fillStyle = '#000000'
      ctx.textAlign = 'center'
      ctx.fillText(code, lW / 2, bot + codeFs + 4)

      ctx.font      = `${nameFs}px Arial, sans-serif`
      ctx.fillStyle = '#444444'
      ctx.fillText(name, lW / 2, bot + codeFs + nameFs + 10)

      doc.addImage(lc.toDataURL('image/png'), 'PNG', 0, 0, lWm, lHm)
    })

    return doc
  }

  // ── Handlers ──────────────────────────────────────────────────────────
  const handlePrint = () => {
    setIsGenerating(true)
    try {
      const blob = generatePDF().output('blob')
      const url  = URL.createObjectURL(blob)
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 10000)
    } finally {
      setIsGenerating(false)
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
              {totalStickers} sticker{totalStickers !== 1 ? 's' : ''} across {batches.length} batch{batches.length !== 1 ? 'es' : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
            <X size={22} />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-6">

          {/* Preview */}
          <div>
            <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">
              Preview — first sticker
            </p>
            <div className="flex justify-center bg-neutral-50 rounded-xl p-4 border border-neutral-200">
              <canvas
                ref={previewRef}
                className="max-w-full border border-neutral-200 rounded shadow-sm"
                style={{ maxHeight: '180px', width: 'auto' }}
              />
            </div>
          </div>

          {/* Barcode scale only */}
          <div>
            <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">
              Barcode Scale
            </label>
            <div className="mt-2 flex items-center gap-4">
              <input
                type="range" min={1} max={4} step={0.5}
                value={barcodeScale}
                onChange={e => setBarcodeScale(Number(e.target.value))}
                className="flex-1 accent-primary"
              />
              <span className="text-sm font-bold text-neutral-700 w-8">{barcodeScale}×</span>
            </div>
          </div>

          {/* Batch list */}
          <div className="bg-neutral-50 rounded-xl border border-neutral-100 p-4">
            <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">Batches</p>
            <div className="flex flex-col gap-2 max-h-40 overflow-y-auto">
              {batches.map(b => (
                <div key={b.batch_id} className="flex items-center justify-between text-sm">
                  <div className="flex flex-col">
                    <span className="font-medium text-neutral-800">{b.picker_name}</span>
                    <span className="font-mono text-xs text-neutral-400">
                      P-{padded(b.picker_id, 4)}
                    </span>
                  </div>
                  <span className="text-neutral-500 text-xs">
                    {padded(b.box_number_from, 4)}–{padded(b.box_number_to, 4)}
                    <span className="ml-2 font-bold text-neutral-700">{b.quantity} stickers</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Print button */}
          <button
            onClick={handlePrint}
            disabled={isGenerating}
            className="w-full py-4 rounded-xl bg-primary-700 text-white font-bold text-sm hover:bg-primary transition-colors flex items-center justify-center gap-2 disabled:opacity-40 shadow-lg shadow-primary-900/20"
          >
            <Printer size={17} strokeWidth={2.5} />
            {isGenerating ? 'Generating...' : 'Open & Print'}
          </button>

        </div>
      </div>
    </div>
  )
}