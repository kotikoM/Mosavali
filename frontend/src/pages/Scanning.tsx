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
import DatePicker from '../components/DatePicker'

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
  const queryClient                       = useQueryClient()
  const { toasts, addToast, removeToast } = useToast()
  const { playError }                     = useErrorSound()

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
    <div className="fixed inset-0 bg-neutral-100 z-40 flex flex-col overflow-hidden">

      {/* Top bar */}
      <div className="flex items-center justify-between px-8 py-5 bg-white border-b border-neutral-100 shadow-sm">
        <div className="flex items-center gap-8">
          <p className="text-3xl font-black text-neutral-900 shrink-0">Active Scan Session</p>

          {/* Divider */}
          <div className="w-px h-10 bg-neutral-200 shrink-0" />

          {/* Session config inline */}
          <div className="flex items-center gap-6">

            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Harvest Date</label>
              <DatePicker value={harvestDate} onChange={setHarvestDate} />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">
                Box Type
                {!boxTypeId && (
                  <span className="ml-2 text-[10px] font-bold text-amber-500 uppercase tracking-widest">
                    Required
                  </span>
                )}
              </label>
              <select
                value={boxTypeId ?? ''}
                onChange={e => setBoxTypeId(Number(e.target.value))}
                className={`px-4 py-2.5 rounded-xl border-2 text-sm font-medium outline-none focus:border-primary transition-colors min-w-56
                  ${!boxTypeId
                    ? 'border-amber-300 bg-amber-50 text-neutral-500'
                    : 'border-neutral-200 bg-neutral-50 text-neutral-800'
                  }`}
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
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* Left — main scan area */}
        <div className="flex-1 flex flex-col gap-4 p-6 overflow-hidden">

          {/* Barcode input — grows to fill space */}
          <div className="bg-white rounded-2xl shadow-md p-6 flex flex-col gap-4 flex-1">

            <div className="flex-[2] relative border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus-within:border-primary transition-colors">
              <input
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="XX-XXXX-XXXX"
                maxLength={12}
                className="w-full h-full min-h-32 px-8 bg-transparent text-7xl font-mono tracking-[0.25em] outline-none text-center placeholder:text-neutral-200 text-neutral-800"
                autoComplete="off"
                autoFocus
              />
              {input && (
                <button
                  onClick={() => { setInput(''); inputRef.current?.focus() }}
                  className="absolute right-5 top-1/2 -translate-y-1/2 text-neutral-300 hover:text-neutral-500 transition-colors"
                >
                  <X size={26} />
                </button>
              )}
            </div>

            <button
              onClick={() => submitBarcode(input)}
              disabled={!isComplete(input)}
              className="flex-[1] w-full rounded-xl bg-primary-700 text-white text-lg font-bold hover:bg-primary transition-colors disabled:opacity-30 flex items-center justify-center gap-3"
            >
              ADD TO QUEUE
              <ChevronRight size={22} strokeWidth={3} />
            </button>

            <p className="text-xs text-neutral-400 text-center shrink-0">
              Scanner auto-submits. Manual entry requires Enter or Add button
            </p>
          </div>

          {/* Commit / Cancel */}
          <div className="flex gap-4 shrink-0">
            <button
              onClick={() => {
                setSessionActive(false)
                setQueue([])
                setInput('')
                setBoxTypeId(null)
              }}
              className="flex-1 py-5 rounded-xl border-2 border-neutral-200 bg-white shadow-sm text-neutral-600 text-base font-semibold hover:bg-neutral-50 transition-colors flex items-center justify-center gap-2"
            >
              <X size={18} strokeWidth={2.5} />
              Clear Session
            </button>
            <button
              onClick={() => commitMutation.mutate()}
              disabled={validCount === 0 || !boxTypeId || !harvestDate || commitMutation.isPending}
              className="flex-[2] py-5 rounded-xl bg-primary-700 text-white text-base font-bold hover:bg-primary transition-colors disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg shadow-primary-900/20"
            >
              <CheckCircle size={18} strokeWidth={2.5} />
              {commitMutation.isPending ? 'Committing...' : `Commit Batch (${validCount} Entries)`}
            </button>
          </div>

        </div>

        {/* Right — counter + queue */}
        <div className="w-80 shrink-0 flex flex-col border-l border-neutral-200 bg-white shadow-[-4px_0_12px_rgba(0,0,0,0.04)]">

          {/* Counter */}
          <div className="bg-primary-700 p-10 flex flex-col items-center justify-center">
            <span className="text-[5rem] font-black text-white tracking-tight leading-none">{validCount}</span>
            <span className="text-primary-300 text-xs font-bold uppercase tracking-[0.2em] mt-3">Total Scanned</span>
          </div>

          {/* Queue header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-100">
            <p className="text-xs font-black uppercase tracking-widest text-neutral-400">Queue</p>
          </div>

          {/* Queue list */}
          <div className="flex-1 overflow-y-auto">
            {queue.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2">
                <ScanBarcode size={28} className="text-neutral-200" />
                <p className="text-sm text-neutral-300">No barcodes yet</p>
              </div>
            ) : (
              <div className="flex flex-col">
                {[...queue].reverse().map((item, idx) => (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between px-5 py-3.5 border-b border-neutral-50 transition-colors bg-neutral-50`}
                  >
                    <div className="flex items-center gap-3">
                      <CheckCircle
                        size={15}
                        className={'text-neutral-300'}
                        strokeWidth={2.5}
                      />
                      <span className="font-mono text-sm text-neutral-700">{item.barcode}</span>
                    </div>
                    <button
                      onClick={() => setQueue(prev => prev.filter(q => q.id !== item.id))}
                      className="text-neutral-200 hover:text-red-500 transition-colors p-1 rounded"
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

      {/* Error popup */}
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
              onClick={() => { setErrorPopup(null); inputRef.current?.focus() }}
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