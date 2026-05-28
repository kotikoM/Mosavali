import { useState, useMemo, useEffect, useRef } from 'react'
import { X, Download, Printer } from 'lucide-react'
import { jsPDF } from 'jspdf'
import JsBarcode from 'jsbarcode'

interface PrintBatch {
  batch_id:        number
  picker_id:       number
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

const LABEL_HEIGHTS = [
  { label: '25mm',  value: 25  },
  { label: '51mm',  value: 51  },
  { label: '76mm',  value: 76  },
  { label: '102mm', value: 102 },
]

const LABEL_WIDTH_MM = 101.6

function padded(n: number, digits: number) {
  return String(n).padStart(digits, '0')
}

function generateStickerCodes(batches: PrintBatch[]): string[] {
  const codes: string[] = []
  for (const batch of batches) {
    for (let i = batch.box_number_from; i <= batch.box_number_to; i++) {
      const pppp = padded(batch.picker_id, 4)
      const bbbb = padded(i, 4)
      codes.push(`${pppp}-${bbbb}`)
    }
  }
  return codes
}

function renderBarcode(code: string, scale: number): string {
  const canvas = document.createElement('canvas')
  JsBarcode(canvas, code, {
    format:       'CODE128',
    width:        scale,
    height:       60,
    displayValue: false,
    margin:       0,
    background:   '#ffffff',
    lineColor:    '#000000',
  })
  return canvas.toDataURL('image/png')
}

export default function PrintDialog({ open, onClose, batches }: Props) {
  const [labelHeightMm, setLabelHeightMm] = useState(51)
  const [barcodeScale, setBarcodeScale]   = useState(2)
  const [isGenerating, setIsGenerating]   = useState(false)
  const previewRef                        = useRef<HTMLCanvasElement>(null)

  const totalStickers = batches.reduce((sum, b) => sum + b.quantity, 0)
  const codes         = useMemo(() => generateStickerCodes(batches), [batches])

  useEffect(() => {
    if (!open || !previewRef.current || codes.length === 0) return
    const canvas = previewRef.current
    const ctx    = canvas.getContext('2d')
    if (!ctx) return

    const DPI    = 96
    const pxW    = Math.round(LABEL_WIDTH_MM / 25.4 * DPI)
    const pxH    = Math.round(labelHeightMm  / 25.4 * DPI)
    canvas.width  = pxW
    canvas.height = pxH

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, pxW, pxH)

    const barcodeCanvas = document.createElement('canvas')
    JsBarcode(barcodeCanvas, codes[0], {
      format:       'CODE128',
      width:        barcodeScale,
      height:       Math.round(pxH * 0.55),
      displayValue: false,
      margin:       0,
      background:   '#ffffff',
      lineColor:    '#000000',
    })

    const barcodeW = barcodeCanvas.width
    const barcodeH = barcodeCanvas.height
    const barcodeX = Math.round((pxW - barcodeW) / 2)
    const barcodeY = Math.round(pxH * 0.08)
    ctx.drawImage(barcodeCanvas, barcodeX, barcodeY)

    const fontSize = Math.round(pxH * 0.14)
    ctx.fillStyle  = '#000000'
    ctx.font       = `bold ${fontSize}px monospace`
    ctx.textAlign  = 'center'
    ctx.fillText(codes[0], pxW / 2, barcodeY + barcodeH + fontSize + 4)

  }, [open, labelHeightMm, barcodeScale, codes])

  const generatePDF = () => {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit:        'mm',
      format:      [labelHeightMm, LABEL_WIDTH_MM],
    })

    codes.forEach((code, idx) => {
      if (idx > 0) doc.addPage([labelHeightMm, LABEL_WIDTH_MM], 'landscape')

      const imgData       = renderBarcode(code, barcodeScale)
      const barcodeCanvas = document.createElement('canvas')
      JsBarcode(barcodeCanvas, code, {
        format:       'CODE128',
        width:        barcodeScale,
        height:       Math.round(labelHeightMm * 0.55 * 3.78),
        displayValue: false,
        margin:       0,
      })

      const barcodeWmm = barcodeCanvas.width  / 3.78
      const barcodeHmm = barcodeCanvas.height / 3.78
      const barcodeX   = (LABEL_WIDTH_MM - barcodeWmm) / 2
      const barcodeY   = labelHeightMm * 0.08

      doc.addImage(imgData, 'PNG', barcodeX, barcodeY, barcodeWmm, barcodeHmm)
      doc.setFont('courier', 'bold')
      doc.setFontSize(labelHeightMm * 0.22)
      doc.text(code, LABEL_WIDTH_MM / 2, barcodeY + barcodeHmm + labelHeightMm * 0.14, { align: 'center' })
    })

    return doc
  }

  const handleDownload = () => {
    setIsGenerating(true)
    try {
      const doc = generatePDF()
      doc.save(`mosavali-stickers-${new Date().toISOString().split('T')[0]}.pdf`)
    } finally {
      setIsGenerating(false)
    }
  }

  const handlePrint = () => {
    setIsGenerating(true)
    try {
      const doc     = generatePDF()
      const blobUrl = doc.output('bloburl')
      const win     = window.open(blobUrl as unknown as string)
      if (win) {
        win.onload = () => { win.focus(); win.print() }
      }
    } finally {
      setIsGenerating(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-neutral-100">
          <div>
            <h2 className="text-xl font-black text-neutral-900">Print Stickers</h2>
            <p className="text-sm text-neutral-400 mt-0.5">
              {totalStickers} sticker{totalStickers > 1 ? 's' : ''} across {batches.length} batch{batches.length > 1 ? 'es' : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 transition-colors">
            <X size={22} />
          </button>
        </div>

        <div className="flex">

          {/* Left — controls */}
          <div className="w-64 shrink-0 p-6 border-r border-neutral-100 flex flex-col gap-5">

            <div>
              <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Label Dimensions</label>
              <div className="mt-2 flex flex-col gap-2">
                {LABEL_HEIGHTS.map(h => (
                  <button
                    key={h.value}
                    onClick={() => setLabelHeightMm(h.value)}
                    className={`px-4 py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors text-left
                      ${labelHeightMm === h.value
                        ? 'border-primary-700 bg-primary-50 text-primary-800'
                        : 'border-neutral-200 text-neutral-600 hover:border-primary hover:bg-primary-50'
                      }`}
                  >
                    {h.label}
                    <span className="text-xs text-neutral-400 ml-2">{LABEL_WIDTH_MM}mm × {h.value}mm</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Barcode Scale</label>
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={4}
                  step={0.5}
                  value={barcodeScale}
                  onChange={e => setBarcodeScale(Number(e.target.value))}
                  className="flex-1 accent-primary"
                />
                <span className="text-sm font-bold text-neutral-600 w-6">{barcodeScale}×</span>
              </div>
            </div>

            <div className="mt-auto pt-4 border-t border-neutral-100">
              <p className="text-xs text-neutral-400 text-center">ZD421 · 4-inch · CODE128</p>
            </div>
          </div>

          {/* Right — preview + actions */}
          <div className="flex-1 p-6 flex flex-col gap-4">

            <div>
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">
                Preview — first sticker
              </p>
              <div className="flex justify-center bg-neutral-50 rounded-xl p-4 border border-neutral-200">
                <canvas
                  ref={previewRef}
                  className="max-w-full border border-neutral-200 rounded shadow-sm"
                  style={{ maxHeight: '200px', width: 'auto' }}
                />
              </div>
            </div>

            {/* Batch summary */}
            <div className="bg-neutral-50 rounded-xl border border-neutral-100 p-4">
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2">Batches</p>
              <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto">
                {batches.map(b => (
                  <div key={b.batch_id} className="flex items-center justify-between text-sm">
                    <span className="text-neutral-600 font-mono text-xs">
                      P-{padded(b.picker_id, 4)}
                    </span>
                    <span className="text-neutral-500 text-xs">
                      {padded(b.box_number_from, 4)}–{padded(b.box_number_to, 4)}
                      <span className="ml-2 font-bold text-neutral-700">{b.quantity} stickers</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-auto">
              <button
                onClick={handleDownload}
                disabled={isGenerating}
                className="flex-1 py-3.5 rounded-xl border-2 border-neutral-200 text-neutral-700 font-semibold text-sm hover:bg-neutral-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-40"
              >
                <Download size={16} strokeWidth={2.5} />
                Download PDF
              </button>
              <button
                onClick={handlePrint}
                disabled={isGenerating}
                className="flex-1 py-3.5 rounded-xl bg-primary-700 text-white font-semibold text-sm hover:bg-primary transition-colors flex items-center justify-center gap-2 disabled:opacity-40 shadow-lg shadow-primary-900/20"
              >
                <Printer size={16} strokeWidth={2.5} />
                {isGenerating ? 'Generating...' : 'Print'}
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}