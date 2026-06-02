import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO, eachDayOfInterval } from 'date-fns'
import { getDailyStats, getHarvestOverview, getPickerStats, getPickerBoxStats, getFieldStats } from '../api/harvest'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { ScanBarcode, Users, Weight, X, ChevronUp, ChevronDown, Maximize2, Minimize2, ChevronLeft, ChevronRight, FileDown } from 'lucide-react'
import DatePicker from '../components/DatePicker'
import { exportDailyHarvestToExcel } from '../utils/exportDailyHarvest'

function fmt(d: Date) { return format(d, 'yyyy-MM-dd') }

const PAGE_SIZE  = 10
const PIE_COLORS = ['#2D5A27', '#65A75B', '#B2D3AD', '#6B705C', '#A8AB93']

export default function Dashboard() {

  const [pickerSearch, setPickerSearch]     = useState('')
  const [pickerPage, setPickerPage]         = useState(1)
  const [sortBy, setSortBy]                 = useState<'total_boxes' | 'total_kg'>('total_boxes')
  const [sortDir, setSortDir]               = useState<'desc' | 'asc'>('desc')
  const [dailyFrom, setDailyFrom]           = useState(fmt(new Date()))
  const [dailyTo, setDailyTo]               = useState(fmt(new Date()))
  const [dailyMaximized, setDailyMaximized] = useState(false)
  const [hoveredPicker, setHoveredPicker]   = useState<number | null>(null)
  const [dailySearch, setDailySearch]       = useState('')
  const [heroDate, setHeroDate] = useState(fmt(new Date()))
  const [originSearch, setOriginSearch] = useState('')
  const [dailyOriginSearch, setDailyOriginSearch] = useState('')
  const [exporting, setExporting] = useState(false)

  const today = fmt(new Date())

  const { data: overview,              isLoading: overviewLoading    } = useQuery({ queryKey: ['harvest-overview'],                     queryFn: getHarvestOverview })
  const { data: pickerStats = [],      isLoading: pickerStatsLoading } = useQuery({ queryKey: ['picker-stats'],                        queryFn: getPickerStats })
  const { data: pickerDailyStats = [], isLoading: dailyLoading       } = useQuery({ queryKey: ['picker-box-stats', dailyFrom, dailyTo], queryFn: () => getPickerBoxStats(dailyFrom, dailyTo) })
  const { data: fieldStats = [],       isLoading: fieldStatsLoading  } = useQuery({ queryKey: ['field-stats'],                         queryFn: () => getFieldStats() })
  const { data: todayStats = [], isLoading: todayLoading } = useQuery({
    queryKey: ['picker-box-stats-hero', heroDate],
    queryFn:  () => getPickerBoxStats(heroDate, heroDate),
  })
  const pickersToday = todayStats.length
  const boxesToday   = todayStats.reduce((sum, p) => sum + p.total_boxes, 0)
  const totalBoxTypes = todayStats.reduce((acc, p) => {
    Object.entries(p.total_box_types).forEach(([name, count]) => {
      acc[name] = (acc[name] ?? 0) + (count as number)
    })
    return acc
  }, {} as Record<string, number>)
  const kgToday      = Math.round(todayStats.reduce((sum, p) => sum + p.total_kg, 0) * 10) / 10

  const dailyColumns = useMemo(() => {
    const days = eachDayOfInterval({ start: parseISO(dailyFrom), end: parseISO(dailyTo) })
    return days.map(d => fmt(d))
  }, [dailyFrom, dailyTo])


  const filteredDailyStats = useMemo(() => {
    return pickerDailyStats.filter(p => {
      const nameMatch   = !dailySearch.trim()       || `${p.first_name} ${p.last_name}`.toLowerCase().includes(dailySearch.toLowerCase()) || p.national_id.includes(dailySearch)
      const originMatch = !dailyOriginSearch.trim() || (p.origin_place ?? '').toLowerCase().includes(dailyOriginSearch.toLowerCase())
      return nameMatch && originMatch
    })
  }, [pickerDailyStats, dailySearch, dailyOriginSearch])

  const handleSort = (col: 'total_boxes' | 'total_kg') => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortBy(col); setSortDir('desc') }
  }

  const filteredPickers = useMemo(() => {
    const filtered = pickerStats.filter(p => {
      const nameMatch   = !pickerSearch.trim() || `${p.first_name} ${p.last_name}`.toLowerCase().includes(pickerSearch.toLowerCase())
      const originMatch = !originSearch.trim() || (p.origin_place ?? '').toLowerCase().includes(originSearch.toLowerCase())
      return nameMatch && originMatch
    })
    return filtered.sort((a, b) => sortDir === 'desc' ? b[sortBy] - a[sortBy] : a[sortBy] - b[sortBy])
  }, [pickerStats, pickerSearch, originSearch, sortBy, sortDir])

  useEffect(() => { setPickerPage(1) }, [pickerSearch, originSearch, sortBy, sortDir])
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dailyMaximized) setDailyMaximized(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dailyMaximized])

  const pickerPageCount  = Math.ceil(filteredPickers.length / PAGE_SIZE)
  const paginatedPickers = filteredPickers.slice((pickerPage - 1) * PAGE_SIZE, pickerPage * PAGE_SIZE)

  const SortIcon = ({ col }: { col: 'total_boxes' | 'total_kg' }) => {
    if (sortBy !== col) return <span className="text-neutral-300 text-xs">↕</span>
    return sortDir === 'desc' ? <ChevronDown size={12} /> : <ChevronUp size={12} />
  }

  const handleExportExcel = async () => {
    if (exporting || filteredDailyStats.length === 0) return
    setExporting(true)
    try {
      await exportDailyHarvestToExcel(filteredDailyStats, dailyColumns, dailyFrom, dailyTo)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-neutral-800">Dashboard</h1>
      </div>

        {/* ── DAY HERO ─────────────────────────────────────────────── */}
        <div className="bg-primary-700 rounded-2xl overflow-hidden">

          <div className="px-8 pt-7 pb-0 flex items-center gap-6">
            <div>
              <p className="text-sm font-bold text-white uppercase tracking-[0.3em]">Field Report</p>
            </div>

            <div className="w-px h-8 bg-primary-500 shrink-0" />

            <div className="flex flex-col gap-1">
              <DatePicker
                value={heroDate}
                onChange={setHeroDate}
                className="border-primary-500 bg-primary-600 text-white hover:bg-primary-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 mt-2">

            <div className="relative flex flex-col px-8 py-8">
              <div className="absolute right-0 top-6 bottom-6 w-px bg-primary-500" />
              <span className="text-lg font-bold text-primary-100 uppercase tracking-widest mb-4">Pickers Active</span>
              <span className="font-mono font-black text-white leading-none" style={{ fontSize: '100px', letterSpacing: '-4px', lineHeight: 1 }}>
                {todayLoading ? '—' : pickersToday}
              </span>
            </div>

            <div className="relative flex flex-col px-8 py-8">
              <div className="absolute right-0 top-6 bottom-6 w-px bg-primary-500" />
              <span className="text-lg font-bold text-primary-100 uppercase tracking-widest mb-4">Boxes Scanned</span>
              <div className="flex items-end gap-6">
                <span className="font-mono font-black text-white leading-none" style={{ fontSize: '100px', letterSpacing: '-4px', lineHeight: 1 }}>
                  {todayLoading ? '—' : boxesToday.toLocaleString()}
                </span>
                {!todayLoading && Object.keys(totalBoxTypes).length > 0 && (
                  <div className="flex flex-col gap-1.5 mb-2.5">
                    {Object.entries(totalBoxTypes).map(([boxName, count]) => (
                      <span key={boxName} className="text-sm font-semibold text-primary-200 whitespace-nowrap">
                        {boxName}: {count.toLocaleString()}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col px-8 py-8">
              <span className="text-lg font-bold text-primary-100 uppercase tracking-widest mb-4">Harvested</span>
              <div className="flex items-baseline gap-4">
                <span className="font-mono font-black text-white leading-none" style={{ fontSize: '100px', letterSpacing: '-4px', lineHeight: 1 }}>
                  {todayLoading ? '—' : kgToday.toLocaleString()}
                </span>
                <span className="text-4xl font-black text-primary-100">kg</span>
              </div>
            </div>

          </div>
        </div>

      {/* ── ALL-TIME STATS + FIELD PIE ──────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4 items-stretch">

        {/* All-time stats */}
        <div className="col-span-2 bg-white rounded-2xl border-2 border-neutral-200 shadow-lg p-6 flex flex-col">
          <p className="text-xl font-bold text-neutral-900 mb-1">All Time</p>
          <p className="text-sm text-neutral-400 mb-6">Cumulative harvest totals</p>

          <div className="flex gap-4 flex-1">

            <div className="flex-1 bg-neutral-50 rounded-2xl p-6 border border-neutral-100 flex flex-col justify-between">
              <p className="text-lg font-bold text-neutral-400 uppercase tracking-widest">Registered Pickers</p>
              <p className="text-6xl font-black text-neutral-400 leading-none">
                {overviewLoading ? '—' : overview?.total_pickers.toLocaleString() ?? '—'}
              </p>
            </div>

            <div className="flex-1 bg-neutral-50 rounded-2xl p-6 border border-neutral-100 flex flex-col justify-between">
              <p className="text-lg font-bold text-neutral-400 uppercase tracking-widest">Boxes Scanned</p>
              <p className="text-6xl font-black text-neutral-400 leading-none">
                {overviewLoading ? '—' : overview?.total_scanned.toLocaleString() ?? '—'}
              </p>
            </div>

            <div className="flex-1 bg-neutral-50 rounded-2xl p-6 border border-neutral-100 flex flex-col justify-between">
              <p className="text-lg font-bold text-neutral-400 uppercase tracking-widest">Total Harvested</p>
              <div className="flex items-baseline gap-2">
                <p className="text-6xl font-black text-neutral-400 leading-none">
                  {overviewLoading ? '—' : overview?.total_kg.toLocaleString() ?? '—'}
                </p>
                <span className="text-2xl font-black text-neutral-400">kg</span>
              </div>
            </div>

          </div>
        </div>

        {/* Field pie */}
        <div className="col-span-1 bg-white rounded-2xl border-2 border-neutral-200 shadow-lg p-6 flex flex-col">
          <div className="mb-6">
            <p className="text-xl font-bold text-neutral-900">By Field</p>
            <p className="text-sm text-neutral-400">kg harvested — all time</p>
          </div>
          {fieldStatsLoading ? (
            <div className="flex items-center justify-center flex-1 text-neutral-400 text-sm">Loading...</div>
          ) : fieldStats.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-2">
              <p className="text-neutral-400 text-sm">No field data yet</p>
            </div>
          ) : (
            <div className="flex flex-col flex-1 gap-4">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={fieldStats} dataKey="total_kg" nameKey="field_name" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={3} isAnimationActive animationBegin={0} animationDuration={800} animationEasing="ease-out">
                    {fieldStats.map((_, idx) => <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value: number) => [`${value.toLocaleString()} kg`, 'Harvested']} contentStyle={{ borderRadius: '12px', border: '2px solid #E3E4E6', fontSize: '12px', fontWeight: 600 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-2">
                {fieldStats.map((f, idx) => {
                  const total = fieldStats.reduce((sum, s) => sum + s.total_kg, 0)
                  const pct   = total > 0 ? ((f.total_kg / total) * 100).toFixed(1) : '0'
                  return (
                    <div key={f.field_id} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} />
                        <span className="text-sm font-medium text-neutral-700 truncate">{f.field_name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-neutral-400">{pct}%</span>
                        <span className="font-mono text-xs font-bold text-neutral-700">{f.total_kg.toLocaleString()} kg</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── PICKER HARVEST TABLE ────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border-2 border-neutral-200 shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b-2 border-neutral-100">
          <div>
            <p className="text-xl font-bold text-neutral-900">Picker Harvest</p>
            <p className="text-sm text-neutral-400">Total harvest by picker — all time</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                value={pickerSearch}
                onChange={e => setPickerSearch(e.target.value)}
                placeholder="Search by name..."
                className="w-44 rounded-xl border-2 border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm outline-none transition-all focus:border-primary focus:bg-white pr-8"
              />
              {pickerSearch && (
                <button onClick={() => setPickerSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-300 hover:text-neutral-500">
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="relative">
              <input
                value={originSearch}
                onChange={e => setOriginSearch(e.target.value)}
                placeholder="Search by origin..."
                className="w-44 rounded-xl border-2 border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm outline-none transition-all focus:border-primary focus:bg-white pr-8"
              />
              {originSearch && (
                <button onClick={() => setOriginSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-300 hover:text-neutral-500">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        </div>

        {pickerStatsLoading ? (
          <div className="flex items-center justify-center py-16 text-neutral-400 text-sm">Loading...</div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-neutral-100 bg-neutral-50">
                  <th className="px-6 py-4 text-left text-xs font-bold text-neutral-500 uppercase tracking-widest">ID</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-neutral-500 uppercase tracking-widest">Picker</th>
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-widest cursor-pointer select-none hover:text-neutral-800 transition-colors" onClick={() => handleSort('total_boxes')}>
                    <div className="flex items-center gap-1">Boxes <SortIcon col="total_boxes" /></div>
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-widest cursor-pointer select-none hover:text-neutral-800 transition-colors" onClick={() => handleSort('total_kg')}>
                    <div className="flex items-center gap-1">Total kg <SortIcon col="total_kg" /></div>
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-neutral-500 uppercase tracking-widest">Origin</th>
                </tr>
              </thead>
              <tbody>
                {paginatedPickers.map((p) => (
                  <tr key={p.picker_id} className="border-b border-neutral-100 hover:bg-primary-50 transition-colors" style={{}}>
                    <td className="px-6 py-4"><span className="font-mono text-sm text-neutral-400">P-{String(p.picker_id).padStart(3, '0')}</span></td>
                    <td className="px-6 py-4"><span className="font-semibold text-neutral-800">{p.first_name} {p.last_name}</span></td>
                    <td className="px-6 py-4"><span className={`font-mono font-bold ${sortBy === 'total_boxes' ? 'text-primary-700' : 'text-neutral-800'}`}>{p.total_boxes.toLocaleString()}</span></td>
                    <td className="px-6 py-4"><span className={`font-mono text-sm font-semibold ${sortBy === 'total_kg' ? 'text-primary-700' : 'text-neutral-600'}`}>{p.total_kg.toLocaleString()} kg</span></td>
                    <td className="px-6 py-4"><span className="text-sm text-neutral-500">{p.origin_place ?? '—'}</span></td>
                  </tr>
                ))}
                {filteredPickers.length === 0 && (
                  <tr><td colSpan={5} className="px-6 py-16 text-center text-neutral-400 text-sm">{pickerSearch ? 'No pickers match your search.' : 'No harvest data yet.'}</td></tr>
                )}
              </tbody>
            </table>

            {pickerPageCount > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t-2 border-neutral-100 bg-neutral-50">
                <p className="text-sm text-neutral-400">
                  Showing <span className="font-semibold text-neutral-700">{(pickerPage - 1) * PAGE_SIZE + 1}–{Math.min(pickerPage * PAGE_SIZE, filteredPickers.length)}</span> of <span className="font-semibold text-neutral-700">{filteredPickers.length}</span> pickers
                </p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPickerPage(p => Math.max(1, p - 1))} disabled={pickerPage === 1} className="p-2 rounded-lg border-2 border-neutral-200 text-neutral-500 hover:border-primary hover:text-primary-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"><ChevronLeft size={15} strokeWidth={2.5} /></button>
                  {Array.from({ length: pickerPageCount }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === pickerPageCount || Math.abs(p - pickerPage) <= 2)
                    .reduce<(number | 'gap')[]>((acc, p, i, arr) => {
                      if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('gap')
                      acc.push(p)
                      return acc
                    }, [])
                    .map((p, i) => p === 'gap'
                      ? <span key={`gap-${i}`} className="w-9 text-center text-neutral-400 text-sm">…</span>
                      : <button key={p} onClick={() => setPickerPage(p)} className={`w-9 h-9 rounded-lg border-2 text-sm font-semibold transition-colors ${pickerPage === p ? 'border-primary-700 bg-primary-700 text-white' : 'border-neutral-200 text-neutral-500 hover:border-primary hover:text-primary-700'}`}>{p}</button>
                    )
                  }
                  <button onClick={() => setPickerPage(p => Math.min(pickerPageCount, p + 1))} disabled={pickerPage === pickerPageCount} className="p-2 rounded-lg border-2 border-neutral-200 text-neutral-500 hover:border-primary hover:text-primary-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"><ChevronRight size={15} strokeWidth={2.5} /></button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── DAILY HARVEST TABLE ─────────────────────────────────────── */}
      <div className={`bg-white border-2 border-neutral-200 shadow-lg overflow-hidden ${dailyMaximized ? 'fixed inset-0 z-50 flex flex-col bg-white' : 'rounded-2xl'}`}>
        <div className="flex items-center gap-6 px-6 py-5 border-b-2 border-neutral-100 shrink-0">
          <div className="shrink-0">
            <p className="text-xl font-bold text-neutral-900">Daily Harvest</p>
            <p className="text-sm text-neutral-400">kg per picker per day</p>
          </div>
          <div className="w-px h-12 bg-neutral-200 shrink-0" />
          <div className="flex items-end gap-3">
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
          <div className="w-px h-12 bg-neutral-200 shrink-0" />
          <div className="flex flex-col gap-0.5">
            <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Picker</label>
            <div className="relative">
              <input value={dailySearch} onChange={e => setDailySearch(e.target.value)} placeholder="Search by name..." className="w-44 rounded-xl border-2 border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm outline-none transition-all focus:border-primary focus:bg-white pr-8" />
              {dailySearch && <button onClick={() => setDailySearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-300 hover:text-neutral-500"><X size={14} /></button>}
            </div>
          </div>
          <div className="flex flex-col gap-0.5">
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

          {/* ── Export divider + button ── */}
          <div className="w-px h-12 bg-neutral-200 shrink-0" />
          <div className="flex flex-col gap-0.5">
            <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Export</label>
            <button
              onClick={handleExportExcel}
              disabled={exporting || filteredDailyStats.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-neutral-200 text-sm font-semibold text-neutral-600 hover:border-primary-300 hover:text-primary-700 hover:bg-primary-50 active:bg-primary-100 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FileDown size={15} strokeWidth={2.5} />
              {exporting ? 'Exporting…' : 'Excel'}
            </button>
          </div>

          <button onClick={() => setDailyMaximized(m => !m)} className="ml-auto p-2 rounded-xl border-2 border-neutral-200 text-neutral-400 hover:text-neutral-700 hover:border-neutral-300 transition-colors">
            {dailyMaximized ? <Minimize2 size={16} strokeWidth={2.5} /> : <Maximize2 size={16} strokeWidth={2.5} />}
          </button>
        </div>

        {dailyLoading ? (
          <div className="flex items-center justify-center py-16 text-neutral-400 text-sm">Loading...</div>
        ) : filteredDailyStats.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-neutral-400 text-sm">No data for this range</div>
        ) : (
          <div className={`flex ${dailyMaximized ? 'flex-1 overflow-hidden min-h-0' : ''}`}>

            {/* Frozen left */}
            <div className="shrink-0 z-10 shadow-[4px_0_8px_rgba(0,0,0,0.06)]">
              <table>
                <thead>
                  <tr className="border-b-2 border-neutral-100 bg-neutral-50">
                    <th className="px-4 py-4 text-left text-xs font-bold text-neutral-400 uppercase tracking-widest whitespace-nowrap w-10">#</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-neutral-500 uppercase tracking-widest whitespace-nowrap">Picker</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-neutral-500 uppercase tracking-widest whitespace-nowrap">Total kg</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-neutral-500 uppercase tracking-widest whitespace-nowrap">Total Boxes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDailyStats.map((p, idx) => (
                    <tr key={p.picker_id} onMouseEnter={() => setHoveredPicker(p.picker_id)} onMouseLeave={() => setHoveredPicker(null)} className="border-b border-neutral-100 transition-colors" style={{ backgroundColor: hoveredPicker === p.picker_id ? '#F0F5EF' : '' }}>
                      <td className="px-4 py-4 whitespace-nowrap align-middle">
                        <span className="text-sm font-bold text-neutral-300 font-mono block text-center leading-none">{idx + 1}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap align-top">
                        <span className="font-semibold text-neutral-800 block">
                          {p.first_name} {p.last_name}
                        </span>
                        <span className="font-mono text-xs text-neutral-400 block mt-0.5">
                          {p.national_id}
                          {p.origin_place && `, ${p.origin_place}`}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap align-top">
                        <span className="font-mono font-bold text-neutral-700 block">{p.total_kg.toLocaleString()} kg</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap align-top">
                        <span className="font-semibold text-neutral-800 block">
                            {p.total_boxes.toLocaleString()}
                        </span>

                        <span className="text-xs text-neutral-400 block mt-0.5">
                            {Object.entries(p.total_box_types)
                                  .map(([boxName, count]) => `${boxName}: ${count}`)
                                  .join(", ")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Scrollable daily columns */}
            <div className={`flex-1 overflow-x-auto ${dailyMaximized ? 'overflow-y-auto' : ''}`}>
              <table>
                <thead>
                  <tr className="border-b-2 border-neutral-100 bg-neutral-50">
                    {dailyColumns.map(day => (
                      <th key={day} className="px-4 py-4 text-left text-xs font-bold text-neutral-500 uppercase tracking-widest whitespace-nowrap min-w-36">
                        {format(parseISO(day), 'MMM dd')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredDailyStats.map(p => (
                    <tr key={p.picker_id} onMouseEnter={() => setHoveredPicker(p.picker_id)} onMouseLeave={() => setHoveredPicker(null)} className="border-b border-neutral-100 transition-colors" style={{ backgroundColor: hoveredPicker === p.picker_id ? '#F0F5EF' : '' }}>
                      {dailyColumns.map(day => {
                        const dayData = p.days[day]
                        if (!dayData || dayData.kg === 0) return <td key={day} className="px-4 py-4 whitespace-nowrap align-middle"><span className="text-neutral-200 text-sm">—</span></td>
                        return (
                            <td key={day} className="px-4 py-4 whitespace-nowrap align-top">
                              <span className="font-mono font-bold text-neutral-800 block">
                                {dayData.kg.toLocaleString()} kg
                              </span>

                              <div className="text-xs text-neutral-400 font-mono mt-0.5">
                                {Object.entries(dayData.box_types).map(([boxName, info], index) => (
                                  <span key={boxName}>
                                    {index > 0 && ", "}
                                    {boxName}: {info.count}
                                  </span>
                                ))}
                              </div>
                            </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </div>
        )}
      </div>

      {dailyMaximized && <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setDailyMaximized(false)} />}

    </div>
  )
}