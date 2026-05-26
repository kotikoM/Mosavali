import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns'
import { getDailyStats, getHarvestOverview, getPickerStats } from '../api/harvest'
import { CalendarDays, ScanBarcode, Users, Weight, X, ChevronUp, ChevronDown } from 'lucide-react'

function fmt(d: Date) { return format(d, 'yyyy-MM-dd') }

function HeatmapCell({ count, max }: { count: number; max: number }) {
  const intensity = max > 0 ? count / max : 0
  const bg =
    intensity === 0  ? 'bg-neutral-100' :
    intensity < 0.25 ? 'bg-primary-100' :
    intensity < 0.5  ? 'bg-primary-200' :
    intensity < 0.75 ? 'bg-primary-400' :
                       'bg-primary-700'
  return (
    <div
      className={`w-5 h-5 rounded-sm ${bg} transition-all duration-500 cursor-default`}
      title={`${count} boxes`}
    />
  )
}

export default function Dashboard() {

  const [pickerSearch, setPickerSearch]   = useState('')
  const [sortBy, setSortBy]               = useState<'total_boxes' | 'total_kg'>('total_boxes')
  const [sortDir, setSortDir]             = useState<'desc' | 'asc'>('desc')

  const handleSort = (col: 'total_boxes' | 'total_kg') => {
    if (sortBy === col) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortBy(col)
      setSortDir('desc')
    }
  }

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['harvest-overview'],
    queryFn:  getHarvestOverview,
  })

  const { data: allStatsData, isLoading: heatmapLoading } = useQuery({
    queryKey: ['harvest-stats-all'],
    queryFn:  () => getDailyStats(),
  })

  const { data: pickerStats = [], isLoading: pickerStatsLoading } = useQuery({
    queryKey: ['picker-stats'],
    queryFn:  getPickerStats,
  })

  const filteredPickers = useMemo(() => {
    const filtered = !pickerSearch.trim()
      ? [...pickerStats]
      : pickerStats.filter(p =>
          `${p.first_name} ${p.last_name}`.toLowerCase().includes(pickerSearch.toLowerCase())
        )
    return filtered.sort((a, b) =>
      sortDir === 'desc' ? b[sortBy] - a[sortBy] : a[sortBy] - b[sortBy]
    )
  }, [pickerStats, pickerSearch, sortBy, sortDir])

  const heatmapRange = useMemo(() => {
    if (!allStatsData?.stats.length) return null
    const dates    = allStatsData.stats.map(s => parseISO(s.harvest_date))
    const earliest = new Date(Math.min(...dates.map(d => d.getTime())))
    const latest   = new Date(Math.max(...dates.map(d => d.getTime())))
    return { start: startOfMonth(earliest), end: endOfMonth(latest) }
  }, [allStatsData])

  const heatmapData = useMemo(() => {
    if (!allStatsData || !heatmapRange) return []
    return eachDayOfInterval(heatmapRange).map(day => {
      const dayStr   = fmt(day)
      const dayTotal = allStatsData.stats
        .filter(s => s.harvest_date === dayStr)
        .reduce((sum, s) => sum + s.count, 0)
      return {
        date:       dayStr,
        label:      format(day, 'd'),
        monthLabel: format(day, 'MMM yyyy'),
        count:      dayTotal,
      }
    })
  }, [allStatsData, heatmapRange])

  const heatmapMax = useMemo(() =>
    Math.max(...heatmapData.map(d => d.count), 1),
    [heatmapData]
  )

  const heatmapByMonth = useMemo(() => {
    const months: { label: string; days: typeof heatmapData }[] = []
    heatmapData.forEach(day => {
      const last = months[months.length - 1]
      if (!last || last.label !== day.monthLabel) {
        months.push({ label: day.monthLabel, days: [day] })
      } else {
        last.days.push(day)
      }
    })
    return months
  }, [heatmapData])

  const SortIcon = ({ col }: { col: 'total_boxes' | 'total_kg' }) => {
    if (sortBy !== col) return <span className="text-neutral-300 text-xs">↕</span>
    return sortDir === 'desc' ? <ChevronDown size={12} /> : <ChevronUp size={12} />
  }

  return (
    <div className="flex flex-col gap-8">

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-neutral-800">Dashboard</h1>
        <p className="mt-1 text-sm text-neutral-500">Harvest operations overview.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">

        <div className="bg-white rounded-2xl border-2 border-neutral-200 shadow-lg p-8 flex items-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-primary-50 flex items-center justify-center shrink-0">
            <Users size={30} className="text-primary-700" strokeWidth={2} />
          </div>
          <div>
            <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Registered Pickers</p>
            <p className="text-4xl font-black text-neutral-900 mt-1">
              {overviewLoading ? '—' : overview?.total_pickers.toLocaleString() ?? '—'}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border-2 border-neutral-200 shadow-lg p-8 flex items-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-primary-50 flex items-center justify-center shrink-0">
            <ScanBarcode size={30} className="text-primary-700" strokeWidth={2} />
          </div>
          <div>
            <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Boxes Scanned</p>
            <p className="text-4xl font-black text-neutral-900 mt-1">
              {overviewLoading ? '—' : overview?.total_scanned.toLocaleString() ?? '—'}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border-2 border-neutral-200 shadow-lg p-8 flex items-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-primary-50 flex items-center justify-center shrink-0">
            <Weight size={30} className="text-primary-700" strokeWidth={2} />
          </div>
          <div>
            <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Total Harvested</p>
            <p className="text-4xl font-black text-neutral-900 mt-1">
              {overviewLoading ? '—' : overview ? `${overview.total_kg.toLocaleString()} kg` : '—'}
            </p>
          </div>
        </div>

      </div>

      {/* Heatmap */}
      <div className="bg-white rounded-2xl border-2 border-neutral-200 shadow-lg p-6">
        <div className="mb-6">
          <p className="text-xl font-bold text-neutral-900">Activity Heatmap</p>
          <p className="text-sm text-neutral-400">
            {heatmapRange
              ? `${format(heatmapRange.start, 'MMM yyyy')} — ${format(heatmapRange.end, 'MMM yyyy')}`
              : 'All time — boxes scanned per day'
            }
          </p>
        </div>

        {heatmapLoading ? (
          <div className="flex items-center justify-center py-12 text-neutral-400 text-sm">Loading...</div>
        ) : heatmapData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <CalendarDays size={32} className="text-neutral-200" />
            <p className="text-neutral-400 text-sm">No scan data yet</p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-5">
              {heatmapByMonth.map(month => (
                <div key={month.label}>
                  <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2">
                    {month.label}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {month.days.map(day => (
                      <div key={day.date} className="flex flex-col items-center gap-1">
                        <HeatmapCell count={day.count} max={heatmapMax} />
                        <span className="text-[9px] text-neutral-300 font-medium leading-none">
                          {day.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-6">
              <span className="text-xs text-neutral-400">Less</span>
              {['bg-neutral-100', 'bg-primary-100', 'bg-primary-200', 'bg-primary-400', 'bg-primary-700'].map(c => (
                <div key={c} className={`w-5 h-5 rounded-sm ${c}`} />
              ))}
              <span className="text-xs text-neutral-400">More</span>
            </div>
          </>
        )}
      </div>

      {/* Picker stats table */}
      <div className="bg-white rounded-2xl border-2 border-neutral-200 shadow-lg overflow-hidden">

        <div className="flex items-center justify-between px-6 py-5 border-b-2 border-neutral-100">
          <div className="flex items-center gap-3">
            <div>
              <p className="text-xl font-bold text-neutral-900">Picker Harvest</p>
              <p className="text-sm text-neutral-400">Total harvest by picker — all time</p>
            </div>
          </div>
          <div className="relative">
            <input
              value={pickerSearch}
              onChange={e => setPickerSearch(e.target.value)}
              placeholder="Search by name..."
              className="w-52 rounded-xl border-2 border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm outline-none transition-all focus:border-primary focus:bg-white"
            />
            {pickerSearch && (
              <button
                onClick={() => setPickerSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-300 hover:text-neutral-500"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {pickerStatsLoading ? (
          <div className="flex items-center justify-center py-16 text-neutral-400 text-sm">Loading...</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-neutral-100 bg-neutral-50">
                <th className="px-6 py-4 text-left text-xs font-bold text-neutral-500 uppercase tracking-widest">
                  ID
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-neutral-500 uppercase tracking-widest">
                  Picker
                </th>

                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-widest cursor-pointer select-none transition-colors hover:text-neutral-800"
                  onClick={() => handleSort('total_boxes')}
                >
                  <div className="flex items-center gap-1">
                    Boxes
                    <SortIcon col="total_boxes" />
                  </div>
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-widest cursor-pointer select-none transition-colors hover:text-neutral-800"
                  onClick={() => handleSort('total_kg')}
                >
                  <div className="flex items-center gap-1">
                    Total kg
                    <SortIcon col="total_kg" />
                  </div>
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-neutral-500 uppercase tracking-widest">
                  Origin
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredPickers.map((p, idx) => (
                <tr key={p.picker_id} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">

                  <td className="px-6 py-4">
                    <span className="font-mono text-sm text-neutral-400">
                      P-{String(p.picker_id).padStart(3, '0')}
                    </span>
                  </td>

                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-neutral-800">
                        {p.first_name} {p.last_name}
                      </span>
                    </div>
                  </td>

                  <td className="px-6 py-4">
                    <span className={`font-mono font-bold ${sortBy === 'total_boxes' ? 'text-primary-700' : 'text-neutral-800'}`}>
                      {p.total_boxes.toLocaleString()}
                    </span>
                  </td>

                  <td className="px-6 py-4">
                    <span className={`font-mono text-sm font-semibold ${sortBy === 'total_kg' ? 'text-primary-700' : 'text-neutral-600'}`}>
                      {p.total_kg.toLocaleString()} kg
                    </span>
                  </td>

                  <td className="px-6 py-4">
                    <span className="text-sm text-neutral-500">{p.origin_place ?? '—'}</span>
                  </td>

                </tr>
              ))}
              {filteredPickers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center text-neutral-400 text-sm">
                    {pickerSearch ? 'No pickers match your search.' : 'No harvest data yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

    </div>
  )
}