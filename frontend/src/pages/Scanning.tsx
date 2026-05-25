import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import type { ColumnDef } from '@tanstack/react-table'
import { ScanBarcode, X, Trash2, CheckCircle, AlertTriangle, ChevronRight } from 'lucide-react'
import { checkBarcode, bulkScan, getEntries } from '../api/harvest'
import { getBoxes } from '../api/boxes'
import type { HarvestEntry, BarcodeCheckResponse } from '../api/harvest'
import { useErrorSound } from '../hooks/useErrorSound'
import Toast from '../components/Toast'
import { useToast } from '../hooks/useToast'

// ── types ──────────────────────────────────────────────────────────────
type ScanStatus = 'idle' | 'valid' | 'error'

interface QueueItem {
  id:      string
  barcode: string
  status:  ScanStatus
  reason:  string | null
}

// ── helpers ────────────────────────────────────────────────────────────
function formatBarcode(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  const p1 = digits.slice(0, 2)
  const p2 = digits.slice(2, 6)
  const p3 = digits.slice(6, 10)
  return [p1, p2, p3].filter(Boolean).join('-')
}

function isComplete(barcode: string): boolean {
  return /^\d{2}-\d{4}-\d{4}$/.test(barcode)
}

const REASON_LABELS: Record<string, string> = {
  invalid_format:  'Invalid barcode format',
  already_scanned: 'This sticker has already been scanned',
  never_printed:   'This sticker was never printed',
}

// ── component ──────────────────────────────────────────────────────────
export default function Scanning() {
  const queryClient               = useQueryClient()
  const { toasts, addToast, removeToast } = useToast()
  const { playError }             = useErrorSound()

  // session state
  const [sessionActive, setSessionActive] = useState(false)
  const [harvestDate, setHarvestDate]     = useState(() => new Date().toISOString().split('T')[0])
  const [boxTypeId, setBoxTypeId]         = useState<number | null>(null)
  const [queue, setQueue]                 = useState<QueueItem[]>([])
  const [input, setInput]                 = useState('')
  const [errorPopup, setErrorPopup]       = useState<BarcodeCheckResponse | null>(null)
  const [isScanner, setIsScanner]         = useState(false)

  const inputRef      = useRef<HTMLInputElement>(null)
  const lastKeyTime   = useRef<number>(0)
  const scannerBuffer = useRef<string>('')

  // ── data fetching ──────────────────────────────────────────────────
  const { data: boxes = [] }   = useQuery({ queryKey: ['boxes'],   queryFn: getBoxes })
  const { data: entries = [], isLoading: entriesLoading } = useQuery({
    queryKey: ['harvest'],
    queryFn:  getEntries,
  })

  // ── scanner detection ──────────────────────────────────────────────
  // Barcode scanners type very fast (< 30ms between keystrokes)
  // We detect this and auto-submit when Enter is received
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    const now = Date.now()
    const delta = now - lastKeyTime.current
    lastKeyTime.current = now

    if (delta < 30) {
      setIsScanner(true)
    } else {
      setIsScanner(false)
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      const formatted = formatBarcode(input.replace(/-/g, ''))
      if (isComplete(formatted)) {
        submitBarcode(formatted)
      }
    }
  }, [input])

  // auto-submit when scanner completes 10 digits fast
  useEffect(() => {
    const digits = input.replace(/-/g, '')
    if (digits.length === 10 && isScanner) {
      const formatted = formatBarcode(digits)
      submitBarcode(formatted)
    }
  }, [input, isScanner])

  // ── auto-focus input when session active ───────────────────────────
  useEffect(() => {
    if (sessionActive) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [sessionActive])

  // ── barcode input formatting ───────────────────────────────────────
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatBarcode(e.target.value)
    setInput(formatted)
  }

  // ── submit barcode ─────────────────────────────────────────────────
  const submitBarcode = useCallback(async (barcode: string) => {
    if (!barcode || !isComplete(barcode)) return

    // prevent duplicates in queue
    if (queue.some(q => q.barcode === barcode)) {
      playError()
      setErrorPopup({ barcode, valid: false, reason: 'already_scanned', scan_date: null })
      setInput('')
      return
    }

    try {
      const result = await checkBarcode(barcode)

      if (!result.valid) {
        playError()
        setErrorPopup(result)
        setInput('')
        return
      }

      setQueue(prev => [...prev, {
        id:     crypto.randomUUID(),
        barcode,
        status: 'valid',
        reason: null,
      }])
      setInput('')
      inputRef.current?.focus()

    } catch {
      addToast('Failed to check barcode', 'error')
    }
  }, [queue, playError])

  // ── commit mutation ────────────────────────────────────────────────
  const commitMutation = useMutation({
    mutationFn: () => {
      if (!boxTypeId || !harvestDate) throw new Error('Missing fields')
      return bulkScan({
        box_type_id:  boxTypeId,
        harvest_date: harvestDate,
        barcodes:     queue.filter(q => q.status === 'valid').map(q => q.barcode),
      })
    },
    onSuccess: (data) => {
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ['harvest'] })
        addToast(`${data.accepted.length} entries committed successfully`, 'success')
        setSessionActive(false)
        setQueue([])
        setInput('')
        setBoxTypeId(null)
      } else {
        addToast(`Commit failed — ${data.problems.length} problem(s) detected`, 'error')
      }
    },
    onError: () => addToast('Failed to commit batch', 'error'),
  })

  const validCount = queue.filter(q => q.status === 'valid').length

  // ── harvest entries table columns ──────────────────────────────────
  const entryColumns: ColumnDef<HarvestEntry>[] = [
    {
      header: 'Barcode',
      id: 'barcode',
      accessorFn: row => `${String(row.fruit_id).padStart(2,'0')}-${String(row.picker_id).padStart(4,'0')}-${String(row.box_number).padStart(4,'0')}`,
      cell: info => <span className="font-mono text-sm text-neutral-700">{info.getValue<string>()}</span>,
    },
    {
      header: 'Picker ID',
      accessorKey: 'picker_id',
      cell: info => <span className="font-mono text-sm text-neutral-500">#{info.getValue<number>()}</span>,
    },
    {
      header: 'Fruit ID',
      accessorKey: 'fruit_id',
      cell: info => <span className="font-mono text-sm text-neutral-500">#{info.getValue<number>()}</span>,
    },
    {
      header: 'Box Number',
      accessorKey: 'box_number',
      cell: info => <span className="font-mono text-sm text-neutral-500">{info.getValue<number>()}</span>,
    },
    {
      header: 'Harvest Date',
      accessorKey: 'harvest_date',
      cell: info => <span className="text-sm text-neutral-600">{info.getValue<string>()}</span>,
    },
  ]

  const entryTable = useReactTable({
    data:            entries,
    columns:         entryColumns,
    getCoreRowModel: getCoreRowModel(),
  })

  // ── idle page ──────────────────────────────────────────────────────
  if (!sessionActive) {
    return (
      <div className="flex flex-col gap-6">

        {/* Header */}
        <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-800">
            Scanning <span className="font-light text-neutral-400">Station</span>
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
              Scan harvest entries.
           </p>
         </div>
          <button
            onClick={() => setSessionActive(true)}
            className="flex items-center gap-3 w-fit px-6 py-3 bg-primary-700 text-white font-semibold rounded-xl hover:bg-primary transition-colors"
          >
            <ScanBarcode size={20} strokeWidth={2.5} />
            Start Scan Session
          </button>
        </div>

        {/* Entries table */}
        <div className="overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-5">
          <div>
            <p className="text-lg font-semibold text-neutral-900">All Harvest Entries</p>
            <p className="text-sm text-neutral-400">{entries.length} total entries</p>
          </div>
          </div>

          {entriesLoading ? (
            <div className="flex items-center justify-center py-20 text-neutral-400 text-sm">Loading...</div>
          ) : (
            <table className="w-full">
              <thead>
                {entryTable.getHeaderGroups().map(hg => (
                  <tr key={hg.id} className="border-b border-neutral-100 bg-neutral-50">
                    {hg.headers.map(h => (
                      <th key={h.id} className="px-6 py-4 text-left text-xs font-bold text-neutral-400 uppercase tracking-widest">
                        {flexRender(h.column.columnDef.header, h.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {entryTable.getRowModel().rows.map(row => (
                  <tr key={row.id} className="border-b border-neutral-50 hover:bg-neutral-50 transition-colors">
                    {row.getVisibleCells().map(cell => (
                      <td key={cell.id} className="px-6 py-4">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
                {entries.length === 0 && (
                  <tr>
                    <td colSpan={entryColumns.length} className="px-6 py-20 text-center text-neutral-400 text-sm">
                      No harvest entries yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <Toast toasts={toasts} onRemove={removeToast} />
      </div>
    )
  }

  // ── active session page ────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-neutral-50 z-40 flex flex-col overflow-hidden">

      {/* Top bar */}
      <div className="flex items-center justify-between px-8 py-4 bg-white border-b border-neutral-100">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-400">Active Scanning Mode</p>
          <p className="text-xl font-bold text-neutral-800">Scan Session</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-50 border border-primary-100">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-xs font-bold text-primary-700 uppercase tracking-wide">Live</span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden gap-0">

        {/* Left — scanner */}
        <div className="flex-1 flex flex-col gap-6 p-8 overflow-y-auto">

          {/* Session config */}
          <div className="bg-white rounded-2xl border border-neutral-100 p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-4">Session Configuration</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Harvest Date</label>
                <input
                  type="date"
                  value={harvestDate}
                  onChange={e => setHarvestDate(e.target.value)}
                  className="mt-1 w-full px-4 py-2.5 rounded-xl border border-neutral-200 bg-neutral-50 text-sm outline-none focus:border-primary transition-colors"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Box Type</label>
                <select
                  value={boxTypeId ?? ''}
                  onChange={e => setBoxTypeId(Number(e.target.value))}
                  className={`mt-1 w-full px-4 py-2.5 rounded-xl border bg-neutral-50 text-sm outline-none focus:border-primary transition-colors
                    ${!boxTypeId ? 'text-neutral-400 border-neutral-200' : 'text-neutral-800 border-neutral-200'}`}
                >
                  <option value="" disabled>Select box type...</option>
                  {boxes.map(box => (
                    <option key={box.box_id} value={box.box_id}>
                      {box.name} — {box.net_weight_kg} kg net
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Barcode input */}
          <div className="bg-white rounded-2xl border border-neutral-100 p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-4">Scan Barcode</p>
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="XX-XXXX-XXXX"
                  maxLength={12}
                  className="w-full px-5 py-4 rounded-xl border-2 border-neutral-200 bg-neutral-50 text-xl font-mono tracking-widest outline-none focus:border-primary transition-colors text-center"
                  autoComplete="off"
                  autoFocus
                />
                {input && (
                  <button
                    onClick={() => setInput('')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-300 hover:text-neutral-500"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
              <button
                onClick={() => submitBarcode(input)}
                disabled={!isComplete(input)}
                className="px-6 py-4 rounded-xl bg-primary-700 text-white font-semibold hover:bg-primary transition-colors disabled:opacity-30 flex items-center gap-2"
              >
                <ChevronRight size={20} strokeWidth={2.5} />
                Add
              </button>
            </div>
            <p className="text-xs text-neutral-400 mt-2 text-center">
              Scanner auto-submits · Manual entry requires Enter or Add button
            </p>
          </div>

          {/* Commit / Cancel */}
          <div className="flex gap-4 mt-auto">
            <button
              onClick={() => {
                setSessionActive(false)
                setQueue([])
                setInput('')
                setBoxTypeId(null)
              }}
              className="flex-1 py-4 rounded-xl border-2 border-neutral-200 text-neutral-600 font-semibold hover:bg-neutral-100 transition-colors flex items-center justify-center gap-2"
            >
              <X size={18} />
              Cancel Session
            </button>
            <button
              onClick={() => commitMutation.mutate()}
              disabled={validCount === 0 || !boxTypeId || !harvestDate || commitMutation.isPending}
              className="flex-2 flex-1 py-4 rounded-xl bg-primary-700 text-white font-semibold hover:bg-primary transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
            >
              <CheckCircle size={18} />
              {commitMutation.isPending ? 'Committing...' : `Commit ${validCount} Entries`}
            </button>
          </div>

        </div>

        {/* Right — counter + queue */}
        <div className="w-80 shrink-0 bg-white border-l border-neutral-100 flex flex-col">

          {/* Counter */}
          <div className="bg-primary-700 p-8 flex flex-col items-center justify-center">
            <span className="text-7xl font-black text-white tracking-tight">{validCount}</span>
            <span className="text-primary-200 text-sm font-semibold uppercase tracking-widest mt-1">Scanned</span>
          </div>

          {/* Queue */}
          <div className="flex-1 overflow-y-auto">
            <div className="px-4 py-3 border-b border-neutral-100">
              <p className="text-xs font-bold uppercase tracking-widest text-neutral-400">Queue</p>
            </div>
            {queue.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-neutral-300 text-sm">
                No barcodes yet
              </div>
            ) : (
              <div className="flex flex-col">
                {[...queue].reverse().map((item, idx) => (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between px-4 py-3 border-b border-neutral-50
                      ${idx === 0 ? 'bg-primary-50' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <CheckCircle size={15} className="text-primary shrink-0" strokeWidth={2.5} />
                      <span className="font-mono text-sm text-neutral-700">{item.barcode}</span>
                    </div>
                    <button
                      onClick={() => setQueue(prev => prev.filter(q => q.id !== item.id))}
                      className="text-neutral-300 hover:text-red-500 transition-colors p-1"
                    >
                      <Trash2 size={14} strokeWidth={2.5} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Error popup — must be closed manually */}
      {errorPopup && (
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
                {errorPopup.reason ? REASON_LABELS[errorPopup.reason] ?? errorPopup.reason : 'Unknown error'}
              </p>
              {errorPopup.scan_date && (
                <p className="text-sm text-neutral-400 mt-2">
                  Previously scanned on {errorPopup.scan_date}
                </p>
              )}
              <p className="font-mono text-sm text-neutral-300 mt-3">{errorPopup.barcode}</p>
            </div>
            <button
              onClick={() => {
                setErrorPopup(null)
                inputRef.current?.focus()
              }}
              className="w-full py-3 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  )
}