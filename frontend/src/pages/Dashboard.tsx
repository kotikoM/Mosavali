import { useState, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, parseISO, eachDayOfInterval } from 'date-fns'
import {
  getHarvestOverview,
  getPickerBoxStats,
  getFieldStats,
  getSummaryStats,
} from '../api/harvest'
import type { SummaryStats } from '../api/harvest'
import { getPickers, updatePicker } from '../api/pickers'
import type { Picker, PickerUpdate } from '../api/pickers'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { X, ChevronUp, ChevronDown, Maximize2, Minimize2, FileDown, Pencil } from 'lucide-react'
import DatePicker from '../components/DatePicker'
import PickerDialog from '../components/PickerDialog'
import Toast from '../components/Toast'
import { useToast } from '../hooks/useToast'
import { exportDailyHarvestToExcel } from '../utils/exportDailyHarvest'
import { fmtDate, todayTbilisi } from '../utils/time'
import axios from 'axios'

type FilterMode = 'day' | 'interval' | 'alltime'

const PIE_BASE_COLOR = '#2D5A27'

function buildPieColors(baseHex: string, count: number): string[] {
  const r = parseInt(baseHex.slice(1, 3), 16) / 255
  const g = parseInt(baseHex.slice(3, 5), 16) / 255
  const b = parseInt(baseHex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2
  let h = 0, s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r)      h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else                h = ((r - g) / d + 4) / 6
  }
  const hDeg = Math.round(h * 360)
  const sPct = Math.round(s * 100)
  const step = Math.max((0.88 - l) / Math.max(count - 1, 1), 0.22)
  return Array.from({ length: count }, (_, i) => {
    const lPct = Math.min(Math.round((l + i * step) * 100), 88)
    return `hsl(${hDeg}, ${sPct}%, ${lPct}%)`
  })
}

function matchesPickerName(p: { first_name: string; last_name: string }, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const firstLast = `${p.first_name} ${p.last_name}`.toLowerCase()
  const lastFirst = `${p.last_name} ${p.first_name}`.toLowerCase()
  return firstLast.includes(q) || lastFirst.includes(q)
}

// ── breakdown dropdown — portal-based to escape overflow-hidden ancestors ──

interface BreakdownDropdownProps {
  open:     boolean
  onToggle: () => void
  items:    Record<string, number>
}

function BreakdownDropdown({ open, onToggle, items }: BreakdownDropdownProps) {
  const btnRef                    = useRef<HTMLButtonElement>(null)
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({})

  const handleToggle = () => {
    if (!open && btnRef.current) {
      const rect       = btnRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      if (spaceBelow >= 200) {
        setPopupStyle({ position: 'fixed', top: rect.bottom + 8, left: rect.left, zIndex: 9999 })
      } else {
        setPopupStyle({ position: 'fixed', bottom: window.innerHeight - rect.top + 8, left: rect.left, zIndex: 9999 })
      }
    }
    onToggle()
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onMouseDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); handleToggle() }}
        className={`p-1.5 rounded-lg transition-colors ${
          open
            ? 'bg-primary-100 text-primary-700'
            : 'text-neutral-300 hover:text-neutral-500 hover:bg-neutral-100'
        }`}
      >
        <ChevronDown
          size={18}
          strokeWidth={2.5}
          className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && createPortal(
        <div
          onMouseDown={e => e.stopPropagation()}
          style={popupStyle}
          className="bg-white border-2 border-neutral-200 rounded-xl shadow-xl p-3 min-w-48"
        >
          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-2">
            Breakdown
          </p>
          {Object.entries(items).map(([name, count]) => (
            <div
              key={name}
              className="flex items-center justify-between gap-8 py-1.5 border-b border-neutral-50 last:border-0"
            >
              <span className="text-xs font-medium text-neutral-600 whitespace-nowrap">{name}</span>
              <span className="font-mono text-xs font-bold text-neutral-800">{count.toLocaleString()}</span>
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}

export default function Dashboard() {

  const queryClient                       = useQueryClient()
  const { toasts, addToast, removeToast } = useToast()

  const [filterMode,  setFilterMode]  = useState<FilterMode>('day')
  const [singleDate,  setSingleDate]  = useState(todayTbilisi)
  const [fromDate,    setFromDate]    = useState(todayTbilisi)
  const [toDate,      setToDate]      = useState(todayTbilisi)
  const [bkdOpen,     setBkdOpen]     = useState(false)

  const [dailySortBy,       setDailySortBy]       = useState<'total_boxes' | 'total_kg'>('total_boxes')
  const [dailySortDir,      setDailySortDir]       = useState<'desc' | 'asc'>('desc')
  const [dailyFrom,         setDailyFrom]          = useState(todayTbilisi)
  const [dailyTo,           setDailyTo]            = useState(todayTbilisi)
  const [dailyMaximized,    setDailyMaximized]     = useState(false)
  const [hoveredPicker,     setHoveredPicker]      = useState<number | null>(null)
  const [dailySearch,       setDailySearch]        = useState('')
  const [dailyOriginSearch, setDailyOriginSearch]  = useState('')
  const [exporting,         setExporting]          = useState(false)
  const [selectedPickerIds, setSelectedPickerIds]  = useState<Set<number>>(new Set())

  // ── picker edit dialog state ────────────────────────────────────────
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editPicker,     setEditPicker]     = useState<Picker | null>(null)

  const { data: overview } = useQuery({
    queryKey: ['harvest-overview'],
    queryFn:  getHarvestOverview,
  })

  const { data: summary, isLoading: summaryLoading } = useQuery<SummaryStats>({
    queryKey: ['summary', filterMode, singleDate, fromDate, toDate],
    queryFn:  () => {
      if (filterMode === 'day')      return getSummaryStats(singleDate)
      if (filterMode === 'interval') return getSummaryStats(undefined, fromDate, toDate)
      return getSummaryStats()
    },
  })

  const { data: fieldStats = [], isLoading: fieldLoading } = useQuery({
    queryKey: ['field-stats', filterMode, singleDate, fromDate, toDate],
    queryFn:  () => {
      if (filterMode === 'day')      return getFieldStats(singleDate)
      if (filterMode === 'interval') return getFieldStats(undefined, fromDate, toDate)
      return getFieldStats()
    },
  })

  const { data: pickerDailyStats = [], isLoading: dailyLoading } = useQuery({
    queryKey: ['picker-box-stats', dailyFrom, dailyTo],
    queryFn:  () => getPickerBoxStats(dailyFrom, dailyTo),
  })

  // full picker records — needed for the edit dialog (phone/bank_info/note
  // aren't present in the harvest-stats payload). Shares the ['pickers']
  // query key with the Pickers page, so this is a cache hit if that page
  // has already been visited this session.
  const { data: pickers = [] } = useQuery({
    queryKey: ['pickers'],
    queryFn:  getPickers,
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number, data: PickerUpdate }) => updatePicker(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pickers'] })
      queryClient.invalidateQueries({ queryKey: ['picker-box-stats'] })
      setEditDialogOpen(false)
      setEditPicker(null)
      addToast('Picker updated successfully', 'success')
    },
    onError: (error) => {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        addToast(error.response.data.detail.message, 'error')
      } else {
        addToast('Failed to update picker', 'error')
      }
    }
  })

  const handleEditSubmit = async (data: PickerUpdate): Promise<Record<string, string> | void> => {
    if (!editPicker) return
    try {
      await updateMutation.mutateAsync({ id: editPicker.picker_id, data })
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        if (error.response.data.detail?.code === 'national_id_conflict') {
          return { national_id: error.response.data.detail.message }
        }
      }
      addToast('Failed to update picker', 'error')
    }
  }

  const handleEditClick = (pickerId: number) => {
    const picker = pickers.find(p => p.picker_id === pickerId)
    if (!picker) {
      addToast('Picker details still loading, try again', 'error')
      return
    }
    setEditPicker(picker)
    setEditDialogOpen(true)
  }

  useEffect(() => {
    if (!bkdOpen) return
    const h = () => setBkdOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [bkdOpen])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && dailyMaximized) setDailyMaximized(false) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [dailyMaximized])

  useEffect(() => {
    setSelectedPickerIds(new Set())
  }, [dailyFrom, dailyTo, dailySearch, dailyOriginSearch])

  const activePickers = summary?.active_pickers ?? 0
  const totalPickers  = overview?.total_pickers  ?? 0
  const totalBoxes    = summary?.total_boxes      ?? 0
  const totalKg       = summary?.total_kg         ?? 0

  const boxBreakdownCounts = useMemo<Record<string, number>>(
    () => summary
      ? Object.fromEntries(Object.entries(summary.box_breakdown).map(([k, v]) => [k, v.count]))
      : {},
    [summary],
  )

  const pieColors  = useMemo(
    () => buildPieColors(PIE_BASE_COLOR, Math.max(fieldStats.length, 1)),
    [fieldStats.length],
  )
  const fieldTotal = fieldStats.reduce((s, f) => s + f.total_kg, 0)

  const dailyColumns = useMemo(() => {
    const days = eachDayOfInterval({ start: parseISO(dailyFrom), end: parseISO(dailyTo) })
    return days.map(d => fmtDate(d))
  }, [dailyFrom, dailyTo])

  const boxNetWeights = useMemo(() => {
    const map: Record<string, number> = {}
    for (const picker of pickerDailyStats)
      for (const dayData of Object.values(picker.days))
        for (const [name, info] of Object.entries(dayData.box_types))
          if (!(name in map)) map[name] = info.net_weight_kg
    return map
  }, [pickerDailyStats])

  const filteredDailyStats = useMemo(() => {
    const f = pickerDailyStats.filter(p => {
      const nm = matchesPickerName(p, dailySearch) || p.national_id.includes(dailySearch.trim())
      const om = !dailyOriginSearch.trim() || (p.origin_place ?? '').toLowerCase().includes(dailyOriginSearch.trim().toLowerCase())
      return nm && om
    })
    return f.sort((a, b) =>
      dailySortDir === 'desc' ? b[dailySortBy] - a[dailySortBy] : a[dailySortBy] - b[dailySortBy]
    )
  }, [pickerDailyStats, dailySearch, dailyOriginSearch, dailySortBy, dailySortDir])

  const allSelected  = filteredDailyStats.length > 0 && filteredDailyStats.every(p => selectedPickerIds.has(p.picker_id))
  const someSelected = selectedPickerIds.size > 0

  const togglePicker = (id: number) =>
    setSelectedPickerIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const handleDailySort = (col: 'total_boxes' | 'total_kg') => {
    if (dailySortBy === col) setDailySortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setDailySortBy(col); setDailySortDir('desc') }
  }

  const DailySortIcon = ({ col }: { col: 'total_boxes' | 'total_kg' }) => {
    if (dailySortBy !== col) return <span className="text-neutral-300 text-xs">↕</span>
    return dailySortDir === 'desc' ? <ChevronDown size={12} /> : <ChevronUp size={12} />
  }

  const handleExportExcel = async () => {
    if (exporting || filteredDailyStats.length === 0) return
    setExporting(true)
    try {
      const rows = someSelected
        ? filteredDailyStats.filter(p => selectedPickerIds.has(p.picker_id))
        : filteredDailyStats
      await exportDailyHarvestToExcel(rows, dailyColumns, dailyFrom, dailyTo)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">

      <h1 className="text-3xl font-bold text-neutral-800">Dashboard</h1>

      {/* ── ISLAND ──────────────────────────────────────────────────── */}
      <div
        className="bg-white rounded-2xl border-2 border-neutral-200 shadow-lg overflow-hidden flex flex-col"
        style={{ height: 'calc(100vh - 7rem)' }}
      >

        {/* header */}
        <div className="flex items-center gap-5 px-8 py-5 border-b-2 border-neutral-100 shrink-0 flex-wrap gap-y-3">

          <span className="text-xl font-bold text-neutral-900 shrink-0">Harvest Report</span>

          <div className="w-px h-7 bg-neutral-200 shrink-0" />

          <div className="flex items-center bg-neutral-100 rounded-xl p-1 gap-0.5 shrink-0">
            {(['day', 'interval', 'alltime'] as FilterMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setFilterMode(mode)}
                className={`px-5 py-1.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                  filterMode === mode
                    ? 'bg-primary-700 text-white shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                {mode === 'day' ? 'Day' : mode === 'interval' ? 'Interval' : 'All time'}
              </button>
            ))}
          </div>

          <div className="w-px h-7 bg-neutral-200 shrink-0" />

          {filterMode === 'day' && (
            <DatePicker value={singleDate} onChange={setSingleDate} />
          )}

          {filterMode === 'interval' && (
            <div className="flex items-center gap-3">
              <DatePicker value={fromDate} onChange={setFromDate} />
              <span className="text-neutral-300 font-bold text-lg">→</span>
              <DatePicker value={toDate} onChange={setToDate} />
            </div>
          )}

          {filterMode === 'alltime' && (
            overview?.first_harvest_date
              ? (
                <span className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-primary-200 bg-primary-50 text-sm font-medium text-primary-700 whitespace-nowrap">
                  Since {format(parseISO(overview.first_harvest_date), 'MMM d, yyyy')}
                </span>
              ) : (
                <span className="flex items-center px-4 py-2.5 rounded-xl border-2 border-neutral-200 bg-neutral-50 text-sm font-medium text-neutral-400 whitespace-nowrap">
                  All records
                </span>
              )
          )}

        </div>

        {/* body */}
        <div className="flex-1 min-h-0 flex overflow-hidden">

          {/* left: 3 stats */}
          <div className="flex flex-col border-r-2 border-neutral-100 overflow-hidden" style={{ flex: '0 0 50%' }}>

            {/* PICKERS ACTIVE */}
            <div className="flex-1 flex flex-col justify-between px-10 py-6 border-b border-neutral-100 min-h-0">
              <span className="text-xs font-bold text-neutral-400 uppercase tracking-[0.2em] shrink-0">
                Pickers Active
              </span>
              <div className="flex items-baseline gap-3 min-w-0">
                <span
                  className="font-mono font-black text-neutral-900 leading-none shrink-0"
                  style={{ fontSize: 'clamp(2rem, 9vh, 100px)', letterSpacing: '-5px' }}
                >
                  {summaryLoading ? '—' : activePickers}
                </span>
                {!summaryLoading && totalPickers > 0 && (
                  <span
                    className="font-mono font-black text-neutral-300 leading-none shrink-0"
                    style={{ fontSize: 'clamp(1rem, 4vh, 36px)', letterSpacing: '-2px' }}
                  >
                    /{totalPickers}
                  </span>
                )}
              </div>
            </div>

            {/* BOXES SCANNED */}
            <div className="flex-1 flex flex-col justify-between px-10 py-6 border-b border-neutral-100 min-h-0">
              <span className="text-xs font-bold text-neutral-400 uppercase tracking-[0.2em] shrink-0">
                Boxes Scanned
              </span>
              <div className="flex items-baseline gap-3 min-w-0">
                <span
                  className="font-mono font-black text-primary-800 leading-none shrink-0"
                  style={{ fontSize: 'clamp(2rem, 9vh, 100px)', letterSpacing: '-5px' }}
                >
                  {summaryLoading ? '—' : totalBoxes.toLocaleString()}
                </span>
                {!summaryLoading && Object.keys(boxBreakdownCounts).length > 0 && (
                  <div className="relative shrink-0" style={{ transform: 'translateY(6px)' }}>
                    <BreakdownDropdown
                      open={bkdOpen}
                      onToggle={() => setBkdOpen(o => !o)}
                      items={boxBreakdownCounts}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* HARVESTED */}
            <div className="flex-1 flex flex-col justify-between px-10 py-6 min-h-0">
              <span className="text-xs font-bold text-neutral-400 uppercase tracking-[0.2em] shrink-0">
                Harvested
              </span>
              <div className="flex items-baseline gap-4 min-w-0">
                <span
                  className="font-mono font-black text-neutral-900 leading-none shrink-0"
                  style={{ fontSize: 'clamp(2rem, 9vh, 100px)', letterSpacing: '-5px' }}
                >
                  {summaryLoading ? '—' : totalKg.toLocaleString()}
                </span>
                <span
                  className="font-black text-neutral-400 leading-none shrink-0"
                  style={{ fontSize: 'clamp(1rem, 4vh, 36px)' }}
                >
                  kg
                </span>
              </div>
            </div>

          </div>

          {/* right: field donut — scrollable so many fields never overflow */}
          <div className="flex-1 flex flex-col px-8 py-8 min-h-0 overflow-y-auto">

            <div className="flex items-start justify-between mb-4 shrink-0">
              <p className="text-xs font-bold text-neutral-400 uppercase tracking-[0.2em]">
                Harvest By Field
              </p>
              {!fieldLoading && fieldStats.length > 0 && (
                <p className="text-sm font-bold text-neutral-400">
                  {fieldTotal.toLocaleString()} kg total
                </p>
              )}
            </div>

            {fieldLoading ? (
              <div className="flex-1 flex items-center justify-center text-neutral-400 text-sm">
                Loading…
              </div>
            ) : fieldStats.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-neutral-400 text-sm">
                No field data for this period
              </div>
            ) : (
              <div className="flex flex-col items-center gap-6">

                <div
                  className="shrink-0 w-full"
                  style={{ maxWidth: 'min(220px, 100%)', height: 'min(220px, 30vh)' }}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={fieldStats}
                        dataKey="total_kg"
                        nameKey="field_name"
                        cx="50%" cy="50%"
                        innerRadius="45%" outerRadius="72%"
                        paddingAngle={3}
                        animationBegin={0}
                        animationDuration={700}
                        animationEasing="ease-out"
                      >
                        {fieldStats.map((_, idx) => (
                          <Cell key={idx} fill={pieColors[idx % pieColors.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => [`${value.toLocaleString()} kg`, 'Harvested']}
                        contentStyle={{
                          borderRadius: '12px',
                          border: '2px solid #E3E4E6',
                          fontSize: '12px',
                          fontWeight: 600,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="w-full flex flex-col gap-3">
                  {fieldStats.map((f, idx) => {
                    const pct = fieldTotal > 0 ? ((f.total_kg / fieldTotal) * 100).toFixed(1) : '0'
                    return (
                      <div key={f.field_id} className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: pieColors[idx % pieColors.length] }}
                          />
                          <span className="text-sm font-medium text-neutral-700 truncate">
                            {f.field_name}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <span className="text-sm text-neutral-400 tabular-nums w-12 text-right">
                            {pct}%
                          </span>
                          <span className="font-mono text-sm font-bold text-neutral-800 tabular-nums">
                            {f.total_kg.toLocaleString()} kg
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>

              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── DAILY HARVEST TABLE ──────────────────────────────────────── */}
      <div className={`bg-white border-2 border-neutral-200 shadow-lg overflow-hidden ${dailyMaximized ? 'fixed inset-0 z-50 flex flex-col bg-white overflow-y-auto' : 'rounded-2xl'}`}>

        {/* header bar */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4 px-6 py-5 border-b-2 border-neutral-100 shrink-0">

          <div className="shrink-0">
            <p className="text-xl font-bold text-neutral-900">Daily Harvest</p>
            <p className="text-sm text-neutral-400">kg per picker per day</p>
          </div>

          <div className="w-px h-12 bg-neutral-200 shrink-0 hidden sm:block" />

          <div className="flex items-end gap-3 shrink-0">
            <div className="flex flex-col gap-0.5">
              <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">From</label>
              <DatePicker value={dailyFrom} onChange={setDailyFrom} />
            </div>
            <div className="text-neutral-300 font-bold pb-2">→</div>
            <div className="flex flex-col gap-0.5">
              <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">To</label>
              <DatePicker value={dailyTo} onChange={setDailyTo} />
            </div>
          </div>

          <div className="w-px h-12 bg-neutral-200 shrink-0 hidden sm:block" />

          <div className="flex flex-col gap-0.5 shrink-0">
            <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Picker</label>
            <div className="relative">
              <input
                value={dailySearch}
                onChange={e => setDailySearch(e.target.value)}
                placeholder="Search by name..."
                className="w-44 rounded-xl border-2 border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm outline-none transition-all focus:border-primary focus:bg-white pr-8"
              />
              {dailySearch && (
                <button onClick={() => setDailySearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-300 hover:text-neutral-500">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-0.5 shrink-0">
            <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Origin</label>
            <div className="relative">
              <input
                value={dailyOriginSearch}
                onChange={e => setDailyOriginSearch(e.target.value)}
                placeholder="Search by origin..."
                className="w-40 rounded-xl border-2 border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm outline-none transition-all focus:border-primary focus:bg-white pr-8"
              />
              {dailyOriginSearch && (
                <button onClick={() => setDailyOriginSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-300 hover:text-neutral-500">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="w-px h-12 bg-neutral-200 shrink-0 hidden sm:block" />

          <div className="flex flex-col items-start gap-0.5 shrink-0">
            <label className="whitespace-nowrap text-xs font-bold text-neutral-400 uppercase tracking-widest">
              Export{someSelected ? <span className="ml-1.5 text-primary-600">· {selectedPickerIds.size} selected</span> : ''}
            </label>
            <button
              onClick={handleExportExcel}
              disabled={exporting || filteredDailyStats.length === 0}
              className="whitespace-nowrap flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-neutral-200 text-sm font-semibold text-neutral-600 hover:border-primary-300 hover:text-primary-700 hover:bg-primary-50 active:bg-primary-100 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FileDown size={15} strokeWidth={2.5} />
              {exporting ? 'Exporting…' : 'Excel'}
            </button>
          </div>

          <button
            onClick={() => setDailyMaximized(m => !m)}
            className="ml-auto self-end flex items-center justify-center h-11 w-11 rounded-xl border-2 border-neutral-200 text-neutral-400 hover:text-neutral-700 hover:border-neutral-300 transition-colors"
          >
            {dailyMaximized ? <Minimize2 size={16} strokeWidth={2.5} /> : <Maximize2 size={16} strokeWidth={2.5} />}
          </button>

        </div>

        {/* table body */}
        {dailyLoading ? (
          <div className="flex items-center justify-center py-16 text-neutral-400 text-sm">Loading...</div>
        ) : filteredDailyStats.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-neutral-400 text-sm">No data for this range</div>
        ) : (
          <div className="flex">

            {/* frozen left panel — horizontal freeze only, no independent vertical scroll */}
            <div className="shrink-0 z-10 shadow-[4px_0_8px_rgba(0,0,0,0.06)]">
              <table>
                <thead>
                  <tr className={`border-b-2 border-neutral-100 bg-neutral-50 ${dailyMaximized ? 'sticky top-0 z-10' : ''}`}>
                    <th className="px-4 py-4 w-10" />
                    <th className="px-2 py-4 w-10" />
                    <th className="px-4 py-4 text-left text-xs font-bold text-neutral-400 uppercase tracking-widest w-10">#</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-neutral-500 uppercase tracking-widest whitespace-nowrap">Picker</th>
                    <th
                      className="px-6 py-4 text-left text-xs font-bold uppercase tracking-widest whitespace-nowrap cursor-pointer select-none hover:text-neutral-800 transition-colors"
                      onClick={() => handleDailySort('total_kg')}
                    >
                      <div className="flex items-center gap-1">Total kg <DailySortIcon col="total_kg" /></div>
                    </th>
                    <th
                      className="px-6 py-4 text-left text-xs font-bold uppercase tracking-widest whitespace-nowrap cursor-pointer select-none hover:text-neutral-800 transition-colors"
                      onClick={() => handleDailySort('total_boxes')}
                    >
                      <div className="flex items-center gap-1">Total Boxes <DailySortIcon col="total_boxes" /></div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDailyStats.map((p, idx) => {
                    const isSelected = selectedPickerIds.has(p.picker_id)
                    return (
                      <tr
                        key={p.picker_id}
                        onClick={() => togglePicker(p.picker_id)}
                        onMouseEnter={() => setHoveredPicker(p.picker_id)}
                        onMouseLeave={() => setHoveredPicker(null)}
                        className="border-b border-neutral-100 transition-colors cursor-pointer"
                        style={{ backgroundColor: isSelected ? '#EDF5EC' : hoveredPicker === p.picker_id ? '#F0F5EF' : '' }}
                      >
                        <td className="px-4 py-4 align-middle">
                          <input type="checkbox" checked={isSelected} onChange={() => {}} className="w-4 h-4 rounded accent-primary-600 pointer-events-none" />
                        </td>
                        <td className="px-2 py-4 align-middle">
                          <button
                            onClick={e => { e.stopPropagation(); handleEditClick(p.picker_id) }}
                            className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition-colors"
                          >
                            <Pencil size={14} strokeWidth={2.5} />
                          </button>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap align-middle">
                          <span className="text-sm font-bold text-neutral-300 font-mono block text-center leading-none">{idx + 1}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap align-top">
                          <span className="font-semibold text-neutral-800 block">{p.last_name} {p.first_name}</span>
                          <span className="font-mono text-xs text-neutral-400 block mt-0.5">
                            {p.national_id}{p.origin_place && `, ${p.origin_place}`}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap align-top">
                          <span className={`font-mono font-bold block ${dailySortBy === 'total_kg' ? 'text-primary-700' : 'text-neutral-700'}`}>
                            {p.total_kg.toLocaleString()} kg
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap align-top">
                          <span className={`font-semibold block ${dailySortBy === 'total_boxes' ? 'text-primary-700' : 'text-neutral-800'}`}>
                            {p.total_boxes.toLocaleString()}
                          </span>
                          <span className="text-xs text-neutral-400 block mt-1 space-y-0.5">
                            {Object.entries(p.total_box_types).map(([name, count]) => {
                              const w = boxNetWeights[name]
                              return (
                                <span key={name} className="block">
                                  {name}{w != null ? ` (${w}kg)` : ''}: {count}
                                </span>
                              )
                            })}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* scrollable day columns — horizontal scroll only, vertical grows with parent */}
            <div className="flex-1 overflow-x-auto">
              <table>
                <thead>
                  <tr className={`border-b-2 border-neutral-100 bg-neutral-50 ${dailyMaximized ? 'sticky top-0 z-10' : ''}`}>
                    {dailyColumns.map(day => (
                      <th key={day} className="px-4 py-4 text-left text-xs font-bold text-neutral-500 uppercase tracking-widest whitespace-nowrap min-w-36">
                        {format(parseISO(day), 'MMM dd')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredDailyStats.map(p => {
                    const isSelected = selectedPickerIds.has(p.picker_id)
                    return (
                      <tr
                        key={p.picker_id}
                        onMouseEnter={() => setHoveredPicker(p.picker_id)}
                        onMouseLeave={() => setHoveredPicker(null)}
                        className="border-b border-neutral-100 transition-colors"
                        style={{ backgroundColor: isSelected ? '#EDF5EC' : hoveredPicker === p.picker_id ? '#F0F5EF' : '' }}
                      >
                        {dailyColumns.map(day => {
                          const dayData = p.days[day]
                          if (!dayData || dayData.kg === 0) return (
                            <td key={day} className="px-4 py-4 whitespace-nowrap align-middle">
                              <span className="text-neutral-200 text-sm">—</span>
                            </td>
                          )
                          return (
                            <td key={day} className="px-4 py-4 whitespace-nowrap align-top">
                              <span className="font-mono font-bold text-neutral-800 block">
                                {dayData.kg.toLocaleString()} kg
                              </span>
                              <div className="text-xs text-neutral-400 font-mono mt-1 space-y-0.5">
                                {Object.entries(dayData.box_types).map(([boxName, info]) => (
                                  <div key={boxName}>
                                    {boxName} ({info.net_weight_kg}kg): {info.count}
                                  </div>
                                ))}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

          </div>
        )}
      </div>

      {dailyMaximized && (
        <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setDailyMaximized(false)} />
      )}

      {/* picker edit dialog */}
      <PickerDialog
        open={editDialogOpen}
        onClose={() => { setEditDialogOpen(false); setEditPicker(null) }}
        onSubmit={handleEditSubmit}
        picker={editPicker}
        loading={updateMutation.isPending}
      />

      {/* toasts */}
      <Toast toasts={toasts} onRemove={removeToast} />

    </div>
  )
}