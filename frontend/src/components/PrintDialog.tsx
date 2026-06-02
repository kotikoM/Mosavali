import { useState, useEffect, useRef } from 'react'
import { X, Printer } from 'lucide-react'
import { jsPDF } from 'jspdf'
import JsBarcode from 'jsbarcode'
import { createPrintBatch } from '../api/printBatches'

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

function padded(n: number, d: number) {
  return String(n).padStart(d, '0')
}

export default function PrintDialog({ open, onClose, items, onSuccess }: Props) {
  const [barcodeScale, setBarcodeScale] = useState(2.5)
  const [isPrinting, setIsPrinting]     = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const previewRef                      = useRef<HTMLCanvasElement>(null)

  const totalStickers = items.reduce((sum, i) => sum + i.quantity, 0)

  // ── Preview — just shows first picker's first code as a sample ────
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

    // sample code using picker_id and box 1
    const sampleCode = `${padded(items[0].picker_id, 4)}-0001`
    const name       = items[0].picker_name

    const bc = document.createElement('canvas')
    JsBarcode(bc, sampleCode, {
      format: 'CODE128', width: barcodeScale,
      height: Math.round(pxH * 0.50),
      displayValue: false, margin: 0,
      background: '#ffffff', lineColor: '#000000',
    })

    const bx  = Math.round((pxW - bc.width) / 2)
    const by  = Math.round(pxH * 0.06)
    ctx.drawImage(bc, bx, by)

    const bot    = by + bc.height
    const codeFs = Math.round(pxH * 0.12)
    const nameFs = Math.round(pxH * 0.10)

    ctx.fillStyle = '#000000'
    ctx.font      = `bold ${codeFs}px monospace`
    ctx.textAlign = 'center'
    ctx.fillText(sampleCode, pxW / 2, bot + codeFs + 4)

    ctx.fillStyle = '#444444'
    ctx.font      = `${nameFs}px sans-serif`
    ctx.fillText(name, pxW / 2, bot + codeFs + nameFs + 10)

  }, [open, barcodeScale, items])

  // ── Print — calls backend then generates PDF ───────────────────────
  const handlePrint = async () => {
    setIsPrinting(true)
    setError(null)

    try {
      // 1. Create batches in backend
      const batches = await createPrintBatch({
        items: items.map(i => ({ picker_id: i.picker_id, quantity: i.quantity }))
      })

      // 2. Build sticker list from returned batches
      const stickerItems: { code: string; name: string }[] = []
      for (const batch of batches) {
        const item = items.find(i => i.picker_id === batch.picker_id)
        const name = item?.picker_name ?? `P-${padded(batch.picker_id, 4)}`
        for (let n = batch.box_number_from; n <= batch.box_number_to; n++) {
          stickerItems.push({
            code: `${padded(batch.picker_id, 4)}-${padded(n, 4)}`,
            name,
          })
        }
      }

      // 3. Generate PDF
      const PX  = 3.78 * 3
      const lW  = Math.round(LABEL_WIDTH_MM  * PX)
      const lH  = Math.round(LABEL_HEIGHT_MM * PX)

      const doc = new jsPDF({
        orientation: 'landscape',
        unit:        'mm',
        format:      [LABEL_WIDTH_MM, LABEL_HEIGHT_MM],
      })

      stickerItems.forEach(({ code, name }, idx) => {
        if (idx > 0) doc.addPage([LABEL_WIDTH_MM, LABEL_HEIGHT_MM], 'landscape')

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

        doc.addImage(lc.toDataURL('image/png'), 'PNG', 0, 0, LABEL_WIDTH_MM, LABEL_HEIGHT_MM)
      })

      // 4. Set filename
      const date     = new Date().toISOString().split('T')[0]
      const filename = `Printed-${date}, pickers-${batches.length}, stickers-${totalStickers}`

      doc.setProperties({
        title:   filename,
        subject: 'Mosavali Harvest Stickers',
        author:  'Seeder Blueberry',
      })

      // 5. Open in new tab only — no auto download
      const blob = doc.output('blob')
      const url  = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }))
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 10000)

      onSuccess()

    } catch (err) {
      setError('Failed to create print batch. Please try again.')
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
                type="range" min={1} max={4} step={0.5}
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
            {isPrinting ? 'Creating batches...' : `Open & Print ${totalStickers} Stickers`}
          </button>

        </div>
      </div>
    </div>
  )
}