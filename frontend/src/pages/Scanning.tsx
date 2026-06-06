import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { flexRender, getCoreRowModel, getFilteredRowModel, useReactTable } from '@tanstack/react-table'
import type { ColumnDef } from '@tanstack/react-table'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { format, subDays, eachDayOfInterval, parseISO } from 'date-fns'
import { ScanBarcode, X, Trash2, CheckCircle, ChevronRight, Box, BarChart2, Rows3, Package2, ChevronLeft, FileDown } from 'lucide-react'
import { checkBarcode, bulkScan, getEntries, getDailyStats, getPickerDetailExport } from '../api/harvest'
import { getBoxes } from '../api/boxes'
import { getFields } from '../api/fields'
import type { HarvestEntry, BarcodeCheckResponse } from '../api/harvest'
import { useErrorSound } from '../hooks/useErrorSound'
import { useToast } from '../hooks/useToast'
import { useSound } from '../hooks/useSound'
import Toast from '../components/Toast'
import DatePicker from '../components/DatePicker'
import FieldManagementDialog from '../components/FieldManagementDialog'
import BoxManagementDialog from '../components/BoxManagementDialog'
import ScanErrorDialog from '../components/ScanErrorDialog'
import { exportPickerDetailToExcel } from '../utils/exportPickerDetail'

// ── types ──────────────────────────────────────────────────────────────

type ScanStatus = 'idle' | 'valid' | 'error'

interface QueueItem {
  id:      string
  barcode: string
  status:  ScanStatus
  reason:  string | null
}

// ── constants ──────────────────────────────────────────────────────────

const BOX_COLORS = ['#2D5A27', '#65A75B', '#B2D3AD', '#6B705C', '#A8AB93']
const PAGE_SIZE  = 25

// ── helpers ────────────────────────────────────────────────────────────

function fmt(d: Date) { return format(d, 'yyyy-MM-dd') }

function formatBarcode(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  return [digits.slice(0, 4), digits.slice(4, 8)].filter(Boolean).join('-')
}

function isComplete(barcode: string): boolean {
  return /^\d{4}-\d{4}$/.test(barcode)
}

// Build the search string passed to the API.
function buildEntriesSearch(picker: string, box: string): string {
  const p = picker.trim()
  const b = box.trim()
  if (!p && !b) return ''
  const pp = p ? p.padStart(4, '0') : ''
  const bb = b ? b.padStart(4, '0') : ''
  if (pp && bb) return `${pp}-${bb}`
  if (pp)       return pp
  return `-${bb}`
}

// ── sub-components ─────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const total   = payload.reduce((sum: number, p: any) => sum + (p.value ?? 0), 0)
  const nonZero = payload.filter((p: any) => p.value > 0)
  return (
    <div className="bg-white border-2 border-neutral-200 rounded-xl px-4 py-3 shadow-lg min-w-36">
      <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2">{label}</p>
      {nonZero.map((p: any) => (
        <p key={p.dataKey} className="text-sm font-semibold" style={{ color: p.fill }}>
          {p.name}: {p.value}
        </p>
      ))}
      {nonZero.length > 1 && (
        <>
          <div className="border-t border-neutral-100 my-2" />
          <p className="text-sm font-black text-neutral-800">Total: {total}</p>
        </>
      )}
    </div>
  )
}

// ── main component ─────────────────────────────────────────────────────

export default function Scanning() {
  const queryClient           = useQueryClient()
  const { toasts, addToast,
          removeToast }       = useToast()
  const { playError }         = useErrorSound()
  const { play: playSuccess } = useSound()
  const inputRef              = useRef<HTMLInputElement>(null)
  const today                 = fmt(new Date())

  // ── session state ────────────────────────────────────────────────
  const [sessionActive, setSessionActive] = useState(false)
  const [harvestDate, setHarvestDate]     = useState(() => fmt(new Date()))
  const [boxTypeId, setBoxTypeId]         = useState<number | null>(null)
  const [fieldId, setFieldId]             = useState<number | null>(null)
  const [queue, setQueue]                 = useState<QueueItem[]>([])
  const [input, setInput]                 = useState('')
  const [errorPopup, setErrorPopup]       = useState<BarcodeCheckResponse | null>(null)

  // ── idle page state ──────────────────────────────────────────────
  const [fromDate, setFromDate]               = useState(fmt(subDays(new Date(), 9)))
  const [toDate, setToDate]                   = useState(fmt(new Date()))
  const [fieldDialogOpen, setFieldDialogOpen] = useState(false)
  const [boxDialogOpen, setBoxDialogOpen]     = useState(false)
  const [pickerIdInput, setPickerIdInput]     = useState('')
  const [boxNumInput, setBoxNumInput]         = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [entriesPage, setEntriesPage]         = useState(1)
  const [exportingDetail, setExportingDetail] = useState(false)

  // ── debounce: rebuild search string whenever either input changes ─
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(buildEntriesSearch(pickerIdInput, boxNumInput))
    }, 300)
    return () => clearTimeout(t)
  }, [pickerIdInput, boxNumInput])

  useEffect(() => { setEntriesPage(1) }, [debouncedSearch])

  // ── queries ──────────────────────────────────────────────────────
  const { data: boxes  = [] } = useQuery({ queryKey: ['boxes'],  queryFn: getBoxes })
  const { data: fields = [] } = useQuery({ queryKey: ['fields'], queryFn: getFields })

  const handleExportDetail = async () =>{
    if (exportingDetail) return
      setExportingDetail(true)
      try {
        const data = await getPickerDetailExport()
        await exportPickerDetailToExcel(data)
      } finally {
        setExportingDetail(false)
    }
  }

  const { data: entriesData, isLoading: entriesLoading } = useQuery({
    queryKey: ['harvest', entriesPage, debouncedSearch],
    queryFn:  () => getEntries(entriesPage, PAGE_SIZE, debouncedSearch),
  })

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['harvest-stats', fromDate, toDate],
    queryFn:  () => getDailyStats(fromDate, toDate),
  })

  // ── derived values ───────────────────────────────────────────────
  const entries      = entriesData?.items ?? []
  const entriesTotal = entriesData?.total ?? 0
  const entriesPages = entriesData?.pages ?? 1
  const validCount   = queue.filter(q => q.status === 'valid').length
  const hasSearch    = pickerIdInput.trim() !== '' || boxNumInput.trim() !== ''

  const barData = useMemo(() => {
    if (!statsData) return []
    return eachDayOfInterval({ start: parseISO(fromDate), end: parseISO(toDate) }).map(day => {
      const dayStr   = fmt(day)
      const dayStats = statsData.stats.filter(s => s.harvest_date === dayStr)
      const entry: Record<string, any> = {
        date:  format(day, 'MMM dd'),
        total: dayStats.reduce((sum, s) => sum + s.count, 0),
      }
      boxes.forEach(box => {
        const s = dayStats.find(s => s.box_type_id === box.box_id)
        entry[box.name] = s?.count ?? 0
      })
      return entry
    })
  }, [statsData, fromDate, toDate, boxes])

  // ── session handlers ─────────────────────────────────────────────
  useEffect(() => {
    if (sessionActive) setTimeout(() => inputRef.current?.focus(), 100)
  }, [sessionActive])

  const endSession = () => {
    setSessionActive(false)
    setQueue([])
    setInput('')
    setBoxTypeId(null)
    setFieldId(null)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(formatBarcode(e.target.value))
  }

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const formatted = formatBarcode(input.replace(/-/g, ''))
      if (isComplete(formatted)) submitBarcode(formatted)
    }
  }, [input])

  const submitBarcode = useCallback(async (barcode: string) => {
    if (!barcode || !isComplete(barcode)) return
    if (queue.some(q => q.barcode === barcode)) {
      playError()
      setErrorPopup({ barcode, valid: false, reason: 'already_scanned', scan_date: null })
      return
    }
    try {
      const result = await checkBarcode(barcode)
      if (!result.valid) {
        playError()
        setErrorPopup(result)
        return
      }
      setQueue(prev => [...prev, { id: crypto.randomUUID(), barcode, status: 'valid', reason: null }])
      playSuccess('success')
      setInput('')
      inputRef.current?.focus()
    } catch {
      addToast('Failed to check barcode', 'error')
    }
  }, [queue, playError])

  const commitMutation = useMutation({
    mutationFn: () => {
      if (!boxTypeId || !harvestDate || !fieldId) throw new Error('Missing fields')
      return bulkScan({
        field_id:     fieldId,
        box_type_id:  boxTypeId,
        harvest_date: harvestDate,
        barcodes:     queue.filter(q => q.status === 'valid').map(q => q.barcode),
      })
    },
    onSuccess: (data) => {
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ['harvest'] })
        queryClient.invalidateQueries({ queryKey: ['harvest-stats'] })
        addToast(`${data.accepted.length} entries committed successfully`, 'success')
        endSession()
      } else {
        addToast(`Commit failed — ${data.problems.length} problem(s) detected`, 'error')
      }
    },
    onError: () => addToast('Failed to commit batch', 'error'),
  })

  // ── table columns ────────────────────────────────────────────────
    const entryColumns: ColumnDef<HarvestEntry>[] = [
      {
        header: 'Barcode', id: 'barcode',
        accessorFn: row => `${String(row.picker_id).padStart(4,'0')}-${String(row.box_number).padStart(4,'0')}`,
        cell: info => <span className="font-mono text-sm text-neutral-700">{info.getValue<string>()}</span>,
      },
      {
        header: 'Picker', id: 'picker',
        accessorFn: row => `${row.picker_first_name} ${row.picker_last_name}`,
        cell: info => (
          <div>
            <span className="font-semibold text-neutral-800 block">{info.getValue<string>()}</span>
            <span className="font-mono text-xs text-neutral-400">#{info.row.original.picker_id}</span>
          </div>
        ),
      },
      {
        header: 'Box Type', id: 'box_type',
        accessorFn: row => row.box_name,
        cell: info => (
          <div>
            <span className="font-semibold text-neutral-800 block">{info.getValue<string>()}</span>
            <span className="text-xs text-neutral-400">{info.row.original.box_net_weight_kg} kg net</span>
          </div>
        ),
      },
      {
        header: 'Field', accessorKey: 'field_name',
        cell: info => <span className="text-sm text-neutral-700">{info.getValue<string>()}</span>,
      },
      {
        header: 'Harvest Date', accessorKey: 'harvest_date',
        cell: info => <span className="text-sm text-neutral-600">{info.getValue<string>()}</span>,
      },
    ]

  const entryTable = useReactTable({
    data:                entries,
    columns:             entryColumns,
    state:               { globalFilter: debouncedSearch },
    getCoreRowModel:     getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  // ── idle page ────────────────────────────────────────────────────
  if (!sessionActive) {
    return (
      <div className="flex flex-col gap-6">

        <h1 className="text-3xl font-bold text-neutral-800">Scanning</h1>

        {/* Top row */}
        <div className="grid grid-cols-4 gap-4">

          <button
            onClick={() => setSessionActive(true)}
            className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-2 border-white/20 hover:border-white/50 bg-primary-700 shadow-lg hover:bg-primary transition-colors"
          >
            <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
              <ScanBarcode size={28} className="text-white" strokeWidth={2.5} />
            </div>
            <p className="text-base font-black text-white uppercase tracking-widest">Start Scanning</p>
          </button>

          <button
            onClick={() => setFieldDialogOpen(true)}
            className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-2 border-neutral-200 bg-white shadow-lg hover:border-primary hover:bg-primary-50 transition-colors group"
          >
            <div className="w-14 h-14 rounded-2xl bg-neutral-100 group-hover:bg-primary-100 flex items-center justify-center transition-colors">
              <Rows3 size={26} className="text-neutral-500 group-hover:text-primary-700 transition-colors" strokeWidth={2} />
            </div>
            <p className="text-sm font-black text-neutral-700 group-hover:text-primary-800 uppercase tracking-widest transition-colors">Manage Fields</p>
          </button>

          <button
            onClick={() => setBoxDialogOpen(true)}
            className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-2 border-neutral-200 bg-white shadow-lg hover:border-primary hover:bg-primary-50 transition-colors group"
          >
            <div className="w-14 h-14 rounded-2xl bg-neutral-100 group-hover:bg-primary-100 flex items-center justify-center transition-colors">
              <Package2 size={26} className="text-neutral-500 group-hover:text-primary-700 transition-colors" strokeWidth={2} />
            </div>
            <p className="text-sm font-black text-neutral-700 group-hover:text-primary-800 uppercase tracking-widest transition-colors">Manage Box Types</p>
          </button>

        </div>

        {/* Bar chart */}
        <div className="bg-white rounded-2xl border-2 border-neutral-200 shadow-lg overflow-hidden">
          <div className="px-6 py-5 border-b-2 border-neutral-100 flex items-center gap-6">
            <div className="shrink-0">
              <p className="text-xl font-bold text-neutral-900">Scanning Velocity</p>
              <p className="text-sm text-neutral-400">Boxes scanned per day by box type</p>
            </div>
            <div className="w-px h-12 bg-neutral-200 shrink-0" />
            <div className="flex items-center gap-3">
              <div className="flex flex-col gap-0.5">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">From</label>
                <DatePicker value={fromDate} onChange={setFromDate} />
              </div>
              <div className="text-neutral-300 font-bold mt-4">→</div>
              <div className="flex flex-col gap-0.5">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">To</label>
                <DatePicker value={toDate} onChange={setToDate} />
              </div>
            </div>
          </div>

          <div className="p-6">
            {statsLoading ? (
              <div className="flex items-center justify-center h-64 text-neutral-400 text-sm">Loading...</div>
            ) : barData.every(d => d.total === 0) ? (
              <div className="flex flex-col items-center justify-center h-64 gap-3">
                <BarChart2 size={36} className="text-neutral-200" />
                <p className="text-neutral-400 text-sm">No data for this range</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={barData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#8E9197', fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#8E9197', fontWeight: 600 }} axisLine={false} tickLine={false} width={32} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f5f5f6' }} />
                  {boxes.length > 0 ? (
                    boxes.map((box, idx) => (
                      <Bar
                        key={box.box_id}
                        dataKey={box.name}
                        stackId="a"
                        fill={BOX_COLORS[idx % BOX_COLORS.length]}
                        radius={idx === boxes.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                        isAnimationActive
                        animationBegin={idx * 80}
                        animationDuration={800}
                        animationEasing="ease-out"
                      />
                    ))
                  ) : (
                    <Bar dataKey="total" fill="#2D5A27" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={800} animationEasing="ease-out" />
                  )}
                </BarChart>
              </ResponsiveContainer>
            )}
            {boxes.length > 0 && !statsLoading && (
              <div className="flex items-center gap-4 mt-4 flex-wrap">
                {boxes.map((box, idx) => (
                  <div key={box.box_id} className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: BOX_COLORS[idx % BOX_COLORS.length] }} />
                    <span className="text-xs font-medium text-neutral-500">{box.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Entries table */}
        <div className="overflow-hidden rounded-2xl border-2 border-neutral-200 bg-white shadow-lg">
        <div className="flex items-center gap-6 px-6 py-5 border-b-2 border-neutral-100">
          <div className="shrink-0">
            <p className="text-xl font-bold text-neutral-900">All Harvest Entries</p>
            <p className="text-sm text-neutral-400">{entriesTotal.toLocaleString()} total entries</p>
          </div>

          <div className="w-px h-12 bg-neutral-200 shrink-0" />

          <div className="flex items-center gap-1">
            <div className="flex flex-col gap-0.5">
              <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Picker ID</label>
              <div className="relative">
                <input
                  value={pickerIdInput}
                  onChange={e => setPickerIdInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="0040"
                  className="w-28 rounded-xl border-2 border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm font-mono outline-none transition-all focus:border-primary focus:bg-white tracking-wider pr-8"
                />
                {pickerIdInput && (
                  <button onClick={() => setPickerIdInput('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-300 hover:text-neutral-500">
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            <span className="text-neutral-300 font-bold mt-5">—</span>

            <div className="flex flex-col gap-0.5">
              <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Box No.</label>
              <div className="relative">
                <input
                  value={boxNumInput}
                  onChange={e => setBoxNumInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="0001"
                  className="w-28 rounded-xl border-2 border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm font-mono outline-none transition-all focus:border-primary focus:bg-white tracking-wider pr-8"
                />
                {boxNumInput && (
                  <button onClick={() => setBoxNumInput('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-300 hover:text-neutral-500">
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="w-px h-12 bg-neutral-200 shrink-0" />

          <div className="flex flex-col gap-0.5">
            <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Export All</label>
            <button
              onClick={handleExportDetail}
              disabled={exportingDetail || entriesTotal === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-neutral-200 text-sm font-semibold text-neutral-600 hover:border-primary-300 hover:text-primary-700 hover:bg-primary-50 active:bg-primary-100 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FileDown size={15} strokeWidth={2.5} />
              {exportingDetail ? 'Exporting…' : 'Excel'}
            </button>
          </div>
        </div>

          {entriesLoading ? (
            <div className="flex items-center justify-center py-20 text-neutral-400 text-sm">Loading...</div>
          ) : (
            <>
              <table className="w-full">
                <thead>
                  {entryTable.getHeaderGroups().map(hg => (
                    <tr key={hg.id} className="border-b-2 border-neutral-100 bg-neutral-50">
                      {hg.headers.map(h => (
                        <th key={h.id} className="px-6 py-4 text-left text-xs font-bold text-neutral-500 uppercase tracking-widest">
                          {flexRender(h.column.columnDef.header, h.getContext())}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {entryTable.getRowModel().rows.map(row => (
                    <tr key={row.id} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
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
                        {hasSearch ? 'No entries match your search.' : 'No harvest entries yet.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {entriesPages > 1 && (
                <div className="flex items-center justify-between px-6 py-4 border-t-2 border-neutral-100 bg-neutral-50">
                  <p className="text-sm text-neutral-400">
                    Showing{' '}
                    <span className="font-semibold text-neutral-700">
                      {(entriesPage - 1) * PAGE_SIZE + 1}–{Math.min(entriesPage * PAGE_SIZE, entriesTotal)}
                    </span>
                    {' '}of{' '}
                    <span className="font-semibold text-neutral-700">{entriesTotal.toLocaleString()}</span>
                    {' '}entries
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEntriesPage(p => Math.max(1, p - 1))}
                      disabled={entriesPage === 1}
                      className="p-2 rounded-lg border-2 border-neutral-200 text-neutral-500 hover:border-primary hover:text-primary-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft size={15} strokeWidth={2.5} />
                    </button>
                    {Array.from({ length: entriesPages }, (_, i) => i + 1)
                      .filter(p => p === 1 || p === entriesPages || Math.abs(p - entriesPage) <= 2)
                      .reduce<(number | 'gap')[]>((acc, p, i, arr) => {
                        if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('gap')
                        acc.push(p)
                        return acc
                      }, [])
                      .map((p, i) => p === 'gap'
                        ? <span key={`gap-${i}`} className="w-9 text-center text-neutral-400 text-sm">…</span>
                        : <button key={p} onClick={() => setEntriesPage(p)} className={`w-9 h-9 rounded-lg border-2 text-sm font-semibold transition-colors ${entriesPage === p ? 'border-primary-700 bg-primary-700 text-white' : 'border-neutral-200 text-neutral-500 hover:border-primary hover:text-primary-700'}`}>{p}</button>
                      )
                    }
                    <button
                      onClick={() => setEntriesPage(p => Math.min(entriesPages, p + 1))}
                      disabled={entriesPage === entriesPages}
                      className="p-2 rounded-lg border-2 border-neutral-200 text-neutral-500 hover:border-primary hover:text-primary-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft size={15} strokeWidth={2.5} className="rotate-180" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <FieldManagementDialog open={fieldDialogOpen} onClose={() => setFieldDialogOpen(false)} />
        <BoxManagementDialog   open={boxDialogOpen}   onClose={() => setBoxDialogOpen(false)} />
        <Toast toasts={toasts} onRemove={removeToast} />
      </div>
    )
  }

  // ── active session ───────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-neutral-100 z-40 flex flex-col overflow-hidden">

      {/* Top bar */}
      <div className="flex items-center px-8 py-5 bg-white border-b border-neutral-100 shadow-sm gap-8">
        <p className="text-3xl font-black text-neutral-900 shrink-0">Active Scan Session</p>
        <div className="w-px h-10 bg-neutral-200 shrink-0" />
        <div className="flex items-center gap-6">

          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Harvest Date</label>
            <DatePicker value={harvestDate} onChange={setHarvestDate} />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">
              Field
              {!fieldId && <span className="ml-2 text-[10px] font-bold text-amber-500 uppercase tracking-widest">Required</span>}
            </label>
            <select
              value={fieldId ?? ''}
              onChange={e => setFieldId(Number(e.target.value))}
              className={`px-4 py-2.5 rounded-xl border-2 text-sm font-medium outline-none focus:border-primary transition-colors min-w-44
                ${!fieldId ? 'border-amber-300 bg-amber-50 text-neutral-500' : 'border-neutral-200 bg-neutral-50 text-neutral-800'}`}
            >
              <option value="" disabled>Select field...</option>
              {fields.map(f => <option key={f.field_id} value={f.field_id}>{f.field_name}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">
              Box Type
              {!boxTypeId && <span className="ml-2 text-[10px] font-bold text-amber-500 uppercase tracking-widest">Required</span>}
            </label>
            <select
              value={boxTypeId ?? ''}
              onChange={e => setBoxTypeId(Number(e.target.value))}
              className={`px-4 py-2.5 rounded-xl border-2 text-sm font-medium outline-none focus:border-primary transition-colors min-w-56
                ${!boxTypeId ? 'border-amber-300 bg-amber-50 text-neutral-500' : 'border-neutral-200 bg-neutral-50 text-neutral-800'}`}
            >
              <option value="" disabled>Select box type...</option>
              {boxes.map(b => <option key={b.box_id} value={b.box_id}>{b.name} — {b.net_weight_kg} kg net</option>)}
            </select>
          </div>

        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* Left */}
        <div className="flex-1 flex flex-col gap-4 p-6 overflow-hidden">
          <div className="bg-white rounded-2xl shadow-md p-6 flex flex-col gap-4 flex-1">

            <div className="flex-[2] relative border-2 border-neutral-200 rounded-2xl bg-neutral-50 focus-within:border-primary transition-colors">
              <input
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="PPPP-BBBB"
                maxLength={9}
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
              Scanner auto-submits on Enter. Manual entry requires Enter or Add button.
            </p>
          </div>

          <div className="flex gap-4 shrink-0">
            <button
              onClick={endSession}
              className="flex-1 py-5 rounded-xl border-2 border-neutral-200 bg-white shadow-sm text-neutral-600 text-base font-semibold hover:bg-neutral-50 transition-colors flex items-center justify-center gap-2"
            >
              <X size={18} strokeWidth={2.5} />
              Close
            </button>
            <button
              onClick={() => commitMutation.mutate()}
              disabled={validCount === 0 || !boxTypeId || !fieldId || !harvestDate || commitMutation.isPending}
              className="flex-[2] py-5 rounded-xl bg-primary-700 text-white text-base font-bold hover:bg-primary transition-colors disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg shadow-primary-900/20"
            >
              <CheckCircle size={18} strokeWidth={2.5} />
              {commitMutation.isPending ? 'Committing...' : `Commit (${validCount} Entries)`}
            </button>
          </div>
        </div>

        {/* Right */}
        <div className="w-80 shrink-0 flex flex-col border-l border-neutral-200 bg-white shadow-[-4px_0_12px_rgba(0,0,0,0.04)]">
          <div className="bg-primary-700 p-10 flex flex-col items-center justify-center">
            <span className="text-[5rem] font-black text-white tracking-tight leading-none">{validCount}</span>
            <span className="text-primary-300 text-xs font-bold uppercase tracking-[0.2em] mt-3">Total Scanned</span>
          </div>

          <div className="px-5 py-3 border-b border-neutral-100">
            <p className="text-xs font-black uppercase tracking-widest text-neutral-400">Queue</p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {queue.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2">
                <ScanBarcode size={28} className="text-neutral-200" />
                <p className="text-sm text-neutral-300">No barcodes yet</p>
              </div>
            ) : (
              <div className="flex flex-col">
                {[...queue].reverse().map(item => (
                  <div key={item.id} className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-50 bg-neutral-50">
                    <div className="flex items-center gap-3">
                      <CheckCircle size={15} className="text-neutral-300" strokeWidth={2.5} />
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

      <ScanErrorDialog
        error={errorPopup}
        onClose={() => { setErrorPopup(null); inputRef.current?.focus() }}
      />

      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  )
}