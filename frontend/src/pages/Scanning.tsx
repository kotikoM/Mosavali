import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { flexRender, getCoreRowModel, getFilteredRowModel, useReactTable } from '@tanstack/react-table'
import type { ColumnDef } from '@tanstack/react-table'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts'
import { format, subDays, eachDayOfInterval, parseISO } from 'date-fns'
import { ScanBarcode, X, Trash2, CheckCircle, AlertTriangle, ChevronRight, TrendingUp, Box, CalendarDays, BarChart2 } from 'lucide-react'
import { checkBarcode, bulkScan, getEntries, getDailyStats } from '../api/harvest'
import { getBoxes } from '../api/boxes'
import { getFields } from '../api/fields'
import type { HarvestEntry, BarcodeCheckResponse } from '../api/harvest'
import { useErrorSound } from '../hooks/useErrorSound'
import Toast from '../components/Toast'
import { useToast } from '../hooks/useToast'
import { useSound } from '../hooks/useSound'
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
function fmt(d: Date) { return format(d, 'yyyy-MM-dd') }

function formatBarcode(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  const p1 = digits.slice(0, 4)
  const p2 = digits.slice(4, 8)
  return [p1, p2].filter(Boolean).join('-')
}

function isComplete(barcode: string): boolean {
  return /^\d{4}-\d{4}$/.test(barcode)
}

function formatBarcodeFilter(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  const p1 = digits.slice(0, 4)
  const p2 = digits.slice(4, 8)
  return [p1, p2].filter(Boolean).join('-')
}

const REASON_LABELS: Record<string, string> = {
  invalid_format:  'Invalid barcode format',
  already_scanned: 'This sticker has already been scanned',
  never_printed:   'This sticker was never printed',
}

const BOX_COLORS = ['#2D5A27', '#65A75B', '#B2D3AD', '#6B705C', '#A8AB93']

// ── custom tooltip ─────────────────────────────────────────────────────
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

// ── component ──────────────────────────────────────────────────────────
export default function Scanning() {
  const queryClient                       = useQueryClient()
  const { toasts, addToast, removeToast } = useToast()
  const { playError }                     = useErrorSound()
  const { play: playSuccess }             = useSound()

  const [sessionActive, setSessionActive] = useState(false)
  const [harvestDate, setHarvestDate]     = useState(() => fmt(new Date()))
  const [boxTypeId, setBoxTypeId]         = useState<number | null>(null)
  const [fieldId, setFieldId]             = useState<number | null>(null)
  const [queue, setQueue]                 = useState<QueueItem[]>([])
  const [input, setInput]                 = useState('')
  const [errorPopup, setErrorPopup]       = useState<BarcodeCheckResponse | null>(null)
  const [globalFilter, setGlobalFilter]   = useState('')
  const [fromDate, setFromDate]           = useState(fmt(subDays(new Date(), 9)))
  const [toDate, setToDate]               = useState(fmt(new Date()))

  const inputRef = useRef<HTMLInputElement>(null)

  // ── data fetching ──────────────────────────────────────────────────
  const { data: boxes = [] } = useQuery({ queryKey: ['boxes'],  queryFn: getBoxes })
  const { data: fields = [] } = useQuery({ queryKey: ['fields'], queryFn: getFields })

  const { data: entries = [], isLoading: entriesLoading } = useQuery({
    queryKey: ['harvest'],
    queryFn:  getEntries,
  })

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['harvest-stats', fromDate, toDate],
    queryFn:  () => getDailyStats(fromDate, toDate),
  })

  // ── bar chart data ─────────────────────────────────────────────────
  const barData = useMemo(() => {
    if (!statsData) return []
    const days = eachDayOfInterval({ start: parseISO(fromDate), end: parseISO(toDate) })
    return days.map(day => {
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

  const totalInRange = statsData?.total ?? 0
  const activeDays   = barData.filter(d => d.total > 0).length
  const peakDay      = barData.reduce(
    (a, b) => a.total > b.total ? a : b,
    { date: '—', total: 0 }
  )

  // ── session ────────────────────────────────────────────────────────
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

  const validCount = queue.filter(q => q.status === 'valid').length

  // ── table columns ──────────────────────────────────────────────────
  const entryColumns: ColumnDef<HarvestEntry>[] = [
    {
      header: 'Barcode',
      id: 'barcode',
      accessorFn: row => `${String(row.picker_id).padStart(4,'0')}-${String(row.box_number).padStart(4,'0')}`,
      cell: info => <span className="font-mono text-sm text-neutral-700">{info.getValue<string>()}</span>,
    },
    {
      header: 'Picker ID',
      accessorKey: 'picker_id',
      cell: info => <span className="font-mono text-sm text-neutral-500">#{info.getValue<number>()}</span>,
    },
    {
      header: 'Field ID',
      accessorKey: 'field_id',
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
    data:                 entries,
    columns:              entryColumns,
    state:                { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel:      getCoreRowModel(),
    getFilteredRowModel:  getFilteredRowModel(),
  })

  // ── idle page ──────────────────────────────────────────────────────
  if (!sessionActive) {
    return (
      <div className="flex flex-col gap-6">

        <div>
          <h1 className="text-3xl font-bold text-neutral-800">
            Scanning <span className="font-light text-neutral-400">Station</span>
          </h1>
          <p className="mt-2 text-sm text-neutral-500">Scan harvest entries.</p>
        </div>

        {/* Top row — action + stats */}
        <div className="grid grid-cols-4 gap-4">

          <button
            onClick={() => setSessionActive(true)}
            className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-2 border-primary-700 bg-primary-700 shadow-lg hover:bg-primary transition-colors"
          >
            <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
              <ScanBarcode size={28} className="text-white" strokeWidth={2.5} />
            </div>
            <div className="text-center">
              <p className="text-base font-black text-white uppercase tracking-widest">Start</p>
              <p className="text-base font-black text-white uppercase tracking-widest">Scan Session</p>
            </div>
          </button>

          <div className="bg-white rounded-2xl border-2 border-neutral-200 shadow-lg p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary-50 flex items-center justify-center shrink-0">
              <Box size={26} className="text-primary-700" strokeWidth={2} />
            </div>
            <div>
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Total Boxes</p>
              <p className="text-3xl font-black text-neutral-900 mt-0.5">
                {statsLoading ? '—' : totalInRange.toLocaleString()}
              </p>
              <p className="text-xs text-neutral-400 mt-0.5">last 10 days</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border-2 border-neutral-200 shadow-lg p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary-50 flex items-center justify-center shrink-0">
              <CalendarDays size={26} className="text-primary-700" strokeWidth={2} />
            </div>
            <div>
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Active Days</p>
              <p className="text-3xl font-black text-neutral-900 mt-0.5">
                {statsLoading ? '—' : activeDays}
              </p>
              <p className="text-xs text-neutral-400 mt-0.5">days with scans</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border-2 border-neutral-200 shadow-lg p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary-50 flex items-center justify-center shrink-0">
              <TrendingUp size={26} className="text-primary-700" strokeWidth={2} />
            </div>
            <div>
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Peak Day</p>
              <p className="text-3xl font-black text-neutral-900 mt-0.5">
                {statsLoading ? '—' : peakDay.total > 0 ? peakDay.total : '—'}
              </p>
              <p className="text-xs text-neutral-400 mt-0.5">
                {peakDay.total > 0 ? peakDay.date : 'no data yet'}
              </p>
            </div>
          </div>

        </div>

        {/* Bar chart */}
        <div className="bg-white rounded-2xl border-2 border-neutral-200 shadow-lg overflow-hidden">
          <div className="px-6 py-5 border-b-2 border-neutral-100 flex items-center gap-6">
            <div className="flex items-center gap-3 shrink-0">
              <div>
                <p className="text-xl font-bold text-neutral-900">Scanning Velocity</p>
                <p className="text-sm text-neutral-400">Boxes scanned per day by box type</p>
              </div>
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
                        isAnimationActive={true}
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
          <div className="flex items-center justify-between border-b-2 border-neutral-100 px-6 py-5">
            <div>
              <p className="text-xl font-bold text-neutral-900">All Harvest Entries</p>
              <p className="text-sm text-neutral-400">{entries.length} total entries</p>
            </div>
            <div className="relative">
              <input
                value={globalFilter}
                onChange={e => setGlobalFilter(formatBarcodeFilter(e.target.value))}
                placeholder="PPPP-BBBB"
                maxLength={9}
                className="w-52 rounded-xl border-2 border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm font-mono outline-none transition-all focus:border-primary focus:bg-white tracking-wider"
              />
              {globalFilter && (
                <button
                  onClick={() => setGlobalFilter('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-300 hover:text-neutral-500"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {entriesLoading ? (
            <div className="flex items-center justify-center py-20 text-neutral-400 text-sm">Loading...</div>
          ) : (
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

  // ── active session ─────────────────────────────────────────────────
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
              {fields.map(field => (
                <option key={field.field_id} value={field.field_id}>
                  {field.field_name}
                </option>
              ))}
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
              {boxes.map(box => (
                <option key={box.box_id} value={box.box_id}>
                  {box.name} — {box.net_weight_kg} kg net
                </option>
              ))}
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
              Clear Session
            </button>
            <button
              onClick={() => commitMutation.mutate()}
              disabled={validCount === 0 || !boxTypeId || !fieldId || !harvestDate || commitMutation.isPending}
              className="flex-[2] py-5 rounded-xl bg-primary-700 text-white text-base font-bold hover:bg-primary transition-colors disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg shadow-primary-900/20"
            >
              <CheckCircle size={18} strokeWidth={2.5} />
              {commitMutation.isPending ? 'Committing...' : `Commit Batch (${validCount} Entries)`}
            </button>
          </div>
        </div>

        {/* Right */}
        <div className="w-80 shrink-0 flex flex-col border-l border-neutral-200 bg-white shadow-[-4px_0_12px_rgba(0,0,0,0.04)]">
          <div className="bg-primary-700 p-10 flex flex-col items-center justify-center">
            <span className="text-[5rem] font-black text-white tracking-tight leading-none">{validCount}</span>
            <span className="text-primary-300 text-xs font-bold uppercase tracking-[0.2em] mt-3">Total Scanned</span>
          </div>

          <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-100">
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
                <p className="text-sm text-neutral-400 mt-2">Previously scanned on {errorPopup.scan_date}</p>
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