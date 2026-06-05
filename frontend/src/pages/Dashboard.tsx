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
  const MIN_STEP = 0.22
  const step = Math.max((0.88 - l) / Math.max(count - 1, 1), MIN_STEP)
  return Array.from({ length: count }, (_, i) => {
    const lPct = Math.min(Math.round((l + i * step) * 100), 88)
    return `hsl(${hDeg}, ${sPct}%, ${lPct}%)`
  })
}

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
  const [heroDate, setHeroDate]             = useState(fmt(new Date()))
  const [originSearch, setOriginSearch]     = useState('')
  const [dailyOriginSearch, setDailyOriginSearch] = useState('')
  const [exporting, setExporting]           = useState(false)
  const [selectedPickerIds, setSelectedPickerIds] = useState<Set<number>>(new Set())

  const today = fmt(new Date())

  const { data: overview,              isLoading: overviewLoading    } = useQuery({ queryKey: ['harvest-overview'],                      queryFn: getHarvestOverview })
  const { data: pickerStats = [],      isLoading: pickerStatsLoading } = useQuery({ queryKey: ['picker-stats'],                         queryFn: getPickerStats })
  const { data: pickerDailyStats = [], isLoading: dailyLoading       } = useQuery({ queryKey: ['picker-box-stats', dailyFrom, dailyTo],  queryFn: () => getPickerBoxStats(dailyFrom, dailyTo) })
  const { data: fieldStats = [],       isLoading: fieldStatsLoading  } = useQuery({ queryKey: ['field-stats'],                          queryFn: () => getFieldStats() })
  const { data: todayStats = [],       isLoading: todayLoading       } = useQuery({
    queryKey: ['picker-box-stats-hero', heroDate],
    queryFn:  () => getPickerBoxStats(heroDate, heroDate),
  })

  const { data: allTimeStats = [] } = useQuery({
    queryKey: ['picker-box-stats-alltime'],
    queryFn:  () => getPickerBoxStats(),
  })

  const pieColors = useMemo(
    () => buildPieColors(PIE_BASE_COLOR, Math.max(fieldStats.length, 1)),
    [fieldStats.length]
  )

  const allTimeBoxTypes = useMemo(() => {
    return allTimeStats.reduce((acc, p) => {
      Object.entries(p.total_box_types).forEach(([name, count]) => {
        acc[name] = (acc[name] ?? 0) + (count as number)
      })
      return acc
    }, {} as Record<string, number>)
  }, [allTimeStats])

  const pickersToday  = todayStats.length
  const boxesToday    = todayStats.reduce((sum, p) => sum + p.total_boxes, 0)
  const totalBoxTypes = todayStats.reduce((acc, p) => {
    Object.entries(p.total_box_types).forEach(([name, count]) => {
      acc[name] = (acc[name] ?? 0) + (count as number)
    })
    return acc
  }, {} as Record<string, number>)
  const kgToday = Math.round(todayStats.reduce((sum, p) => sum + p.total_kg, 0) * 10) / 10

  const dailyColumns = useMemo(() => {
    const days = eachDayOfInterval({ start: parseISO(dailyFrom), end: parseISO(dailyTo) })
    return days.map(d => fmt(d))
  }, [dailyFrom, dailyTo])

  const boxNetWeights = useMemo(() => {
    const map: Record<string, number> = {}
    for (const picker of pickerDailyStats) {
      for (const dayData of Object.values(picker.days)) {
        for (const [name, info] of Object.entries(dayData.box_types)) {
          if (!(name in map)) map[name] = info.net_weight_kg
        }
      }
    }
    return map
  }, [pickerDailyStats])

  const filteredDailyStats = useMemo(() => {
    return pickerDailyStats.filter(p => {
      const nameMatch   = !dailySearch.trim()       || `${p.first_name} ${p.last_name}`.toLowerCase().includes(dailySearch.toLowerCase()) || p.national_id.includes(dailySearch)
      const originMatch = !dailyOriginSearch.trim() || (p.origin_place ?? '').toLowerCase().includes(dailyOriginSearch.toLowerCase())
      return nameMatch && originMatch
    })
  }, [pickerDailyStats, dailySearch, dailyOriginSearch])

  // ── Selection helpers ─────────────────────────────────────────────
  const allSelected  = filteredDailyStats.length > 0 &&
                       filteredDailyStats.every(p => selectedPickerIds.has(p.picker_id))
  const someSelected = selectedPickerIds.size > 0

  const togglePicker = (id: number) =>
    setSelectedPickerIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const toggleAll = () =>
    setSelectedPickerIds(
      allSelected
        ? new Set()
        : new Set(filteredDailyStats.map(p => p.picker_id))
    )

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
    setSelectedPickerIds(new Set())
  }, [dailyFrom, dailyTo, dailySearch, dailyOriginSearch])

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

      {/* ── ABOVE THE FOLD ───────────────────────────────────────────
           Removed min-h-[calc(100vh-4rem)] — it caused the all-time
           stat cards to stretch to fill the remaining viewport height
           when zoomed out, pushing numbers to the bottom of huge empty boxes.
      ──────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-6">

        <div>
          <h1 className="text-3xl font-bold text-neutral-800">Dashboard</h1>
        </div>

        {/* ── DAY HERO ─────────────────────────────────────────────── */}
        <div className="bg-primary-700 rounded-2xl overflow-hidden shrink-0">

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

            {/* Each hero cell gets overflow-hidden so 100px numbers
                can't burst the layout at extreme zoom levels */}
            <div className="relative flex flex-col px-8 py-8 overflow-hidden">
              <div className="absolute right-0 top-6 bottom-6 w-px bg-primary-500" />
              <span className="text-lg font-bold text-primary-100 uppercase tracking-widest mb-4">Pickers Active</span>
              <span className="font-mono font-black text-white leading-none" style={{ fontSize: '100px', letterSpacing: '-4px', lineHeight: 1 }}>
                {todayLoading ? '—' : pickersToday}
              </span>
            </div>

            <div className="relative flex flex-col px-8 py-8 overflow-hidden">
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

            <div className="flex flex-col px-8 py-8 overflow-hidden">
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

        {/* ── ALL-TIME STATS + FIELD PIE ─────────────────────────────
             Removed flex-1 min-h-0 from the grid — those made the grid
             grow to fill the (now-removed) viewport-height constraint,
             which is what stretched the stat cards so tall.
        ──────────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-4 items-stretch">

          {/* All-time stats */}
          <div className="col-span-2 bg-white rounded-2xl border-2 border-neutral-200 shadow-lg p-6 flex flex-col min-w-0">
            <p className="text-xl font-bold text-neutral-900 mb-1">All Time Report</p>
            <p className="text-sm text-neutral-400 mb-6">Harvest totals</p>
            {/* Removed flex-1 here — it was pulling the inner flex to fill
                the outer card's stretched height, which came from the grid */}
            <div className="flex gap-4">
              {/* Changed justify-between → gap-3 so label+value stack
                  naturally at top instead of being pushed apart.
                  Changed text-lg tracking-widest → text-xs tracking-wider
                  to prevent label wrapping at high zoom levels. */}
              <div className="flex-1 bg-neutral-50 rounded-2xl p-6 border border-neutral-100 flex flex-col gap-3 min-w-0">
                <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider leading-snug">Registered Pickers</p>
                <p className="text-6xl font-black text-neutral-400 leading-none">
                  {overviewLoading ? '—' : overview?.total_pickers.toLocaleString() ?? '—'}
                </p>
              </div>
              <div className="flex-1 bg-neutral-50 rounded-2xl p-6 border border-neutral-100 flex flex-col gap-3 min-w-0">
                <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider leading-snug">Boxes Scanned</p>
                <div className="flex items-end gap-4">
                  <p className="text-6xl font-black text-neutral-400 leading-none">
                    {overviewLoading ? '—' : overview?.total_scanned.toLocaleString() ?? '—'}
                  </p>
                  {Object.keys(allTimeBoxTypes).length > 0 && (
                    <div className="flex flex-col gap-1 mb-1">
                      {Object.entries(allTimeBoxTypes).map(([name, count]) => (
                        <div key={name} className="flex items-center gap-2">
                          <span className="text-sm font-medium text-neutral-400">{name}:</span>
                          <span className="font-mono text-sm font-bold text-neutral-500">{count.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex-1 bg-neutral-50 rounded-2xl p-6 border border-neutral-100 flex flex-col gap-3 min-w-0">
                <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider leading-snug">Total Harvested</p>
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
              <p className="text-xl font-bold text-neutral-900">Harvest By Field</p>
              <p className="text-sm text-neutral-400">kg harvested — all time</p>
            </div>
            {fieldStatsLoading ? (
              <div className="flex items-center justify-center flex-1 text-neutral-400 text-sm">Loading...</div>
            ) : fieldStats.length === 0 ? (
              <div className="flex flex-col items-center justify-center flex-1 gap-2">
                <p className="text-neutral-400 text-sm">No field data yet</p>
              </div>
            ) : (
              <div className="flex flex-1 gap-4 min-h-0 items-center">
              <div className="shrink-0" style={{ width: 150, height: 150 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={fieldStats} dataKey="total_kg" nameKey="field_name" cx="50%" cy="50%" innerRadius={38} outerRadius={65} paddingAngle={3} isAnimationActive animationBegin={0} animationDuration={800} animationEasing="ease-out">
                      {fieldStats.map((_, idx) => <Cell key={idx} fill={pieColors[idx % pieColors.length]} />)}
                    </Pie>
                    <Tooltip formatter={(value: number) => [`${value.toLocaleString()} kg`, 'Harvested']} contentStyle={{ borderRadius: '12px', border: '2px solid #E3E4E6', fontSize: '12px', fontWeight: 600 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
                <div className="flex flex-col gap-2 overflow-y-auto">
                  {fieldStats.map((f, idx) => {
                    const total = fieldStats.reduce((sum, s) => sum + s.total_kg, 0)
                    const pct   = total > 0 ? ((f.total_kg / total) * 100).toFixed(1) : '0'
                    return (
                      <div key={f.field_id} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: pieColors[idx % pieColors.length] }} />
                          <span className="text-sm font-medium text-neutral-700 truncate">{f.field_name}</span>
                          <span className="flex-1 overflow-hidden whitespace-nowrap text-xs text-neutral-300 tracking-widest">{'- '.repeat(40)}</span>
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

      </div>
      {/* ── END ABOVE THE FOLD ───────────────────────────────────────── */}

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
                  <tr key={p.picker_id} className="border-b border-neutral-100 hover:bg-primary-50 transition-colors">
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

        {/* Toolbar
             Added flex-wrap + gap-x-6 gap-y-4 so controls reflow to the
             next line at high zoom instead of overflowing or clipping.
             gap-x-6 preserves the original horizontal spacing; gap-y-4
             gives breathing room between wrapped rows.
        */}
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
              <input value={dailySearch} onChange={e => setDailySearch(e.target.value)} placeholder="Search by name..." className="w-44 rounded-xl border-2 border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm outline-none transition-all focus:border-primary focus:bg-white pr-8" />
              {dailySearch && <button onClick={() => setDailySearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-300 hover:text-neutral-500"><X size={14} /></button>}
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

          {/* Export */}
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
                    <th className="px-4 py-4 w-10"></th>
                    <th className="px-4 py-4 text-left text-xs font-bold text-neutral-400 uppercase tracking-widest whitespace-nowrap w-10">#</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-neutral-500 uppercase tracking-widest whitespace-nowrap">Picker</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-neutral-500 uppercase tracking-widest whitespace-nowrap">Total kg</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-neutral-500 uppercase tracking-widest whitespace-nowrap">Total Boxes</th>
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
                        style={{
                          backgroundColor: isSelected
                            ? '#EDF5EC'
                            : hoveredPicker === p.picker_id ? '#F0F5EF' : '',
                        }}
                      >
                        <td className="px-4 py-4 align-middle">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="w-4 h-4 rounded accent-primary-600 pointer-events-none"
                          />
                        </td>
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
                              .map(([name, count]) => {
                                const w = boxNetWeights[name]
                                return `${name}${w != null ? ` (${w}kg)` : ''}: ${count}`
                              })
                              .join(', ')}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
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
                  {filteredDailyStats.map(p => {
                    const isSelected = selectedPickerIds.has(p.picker_id)
                    return (
                      <tr
                        key={p.picker_id}
                        onMouseEnter={() => setHoveredPicker(p.picker_id)}
                        onMouseLeave={() => setHoveredPicker(null)}
                        className="border-b border-neutral-100 transition-colors"
                        style={{
                          backgroundColor: isSelected
                            ? '#EDF5EC'
                            : hoveredPicker === p.picker_id ? '#F0F5EF' : '',
                        }}
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
                              <div className="text-xs text-neutral-400 font-mono mt-0.5">
                                {Object.entries(dayData.box_types).map(([boxName, info], index) => (
                                  <span key={boxName}>
                                    {index > 0 && ', '}
                                    {boxName} ({info.net_weight_kg}kg): {info.count}
                                  </span>
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

      {dailyMaximized && <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setDailyMaximized(false)} />}

    </div>
  )
}