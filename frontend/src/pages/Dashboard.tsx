import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns'
import { getDailyStats, getHarvestOverview } from '../api/harvest'
import { CalendarDays, ScanBarcode, Users, Weight } from 'lucide-react'

// ── helpers ────────────────────────────────────────────────────────────
function fmt(d: Date) { return format(d, 'yyyy-MM-dd') }

const TODAY = new Date()

// ── heatmap cell ───────────────────────────────────────────────────────
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

// ── component ──────────────────────────────────────────────────────────
export default function Dashboard() {

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['harvest-overview'],
    queryFn:  getHarvestOverview,
  })

  const { data: allStatsData, isLoading: heatmapLoading } = useQuery({
    queryKey: ['harvest-stats-all'],
    queryFn:  () => getDailyStats(),
  })

  // ── heatmap range ──────────────────────────────────────────────────
  const heatmapRange = useMemo(() => {
    if (!allStatsData?.stats.length) return null
    const dates   = allStatsData.stats.map(s => parseISO(s.harvest_date))
    const earliest = new Date(Math.min(...dates.map(d => d.getTime())))
    const latest   = new Date(Math.max(...dates.map(d => d.getTime())))
    return {
      start: startOfMonth(earliest),
      end:   endOfMonth(latest),
    }
  }, [allStatsData])

  // ── heatmap data ───────────────────────────────────────────────────
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

  // group heatmap by month
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

  return (
    <div className="flex flex-col gap-8">

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-neutral-800">Dashboard</h1>
        <p className="mt-1 text-sm text-neutral-500">Harvest operations overview.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">

        {/* Total Pickers */}
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

        {/* Total Scanned */}
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

        {/* Total KG */}
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

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <CalendarDays size={20} className="text-primary-700" strokeWidth={2.5} />
          <div>
            <p className="text-xl font-bold text-neutral-900">Activity Heatmap</p>
            <p className="text-sm text-neutral-400">
              {heatmapRange
                ? `${format(heatmapRange.start, 'MMM yyyy')} — ${format(heatmapRange.end, 'MMM yyyy')}`
                : 'All time — boxes scanned per day'
              }
            </p>
          </div>
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

            {/* Legend */}
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

    </div>
  )
}