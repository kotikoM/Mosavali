import { NavLink } from 'react-router-dom'
import { LayoutDashboard, ScanBarcode, Printer, Users, FileDown } from 'lucide-react'
import { useState } from 'react'
import { getMasterExport } from '../api/harvest'
import { exportMasterToExcel } from '../utils/exportMaster'

const links = [
  { to: '/',         label: 'Dashboard', icon: LayoutDashboard },
  { to: '/pickers',  label: 'Picker',    icon: Users },
  { to: '/printing', label: 'Print',   icon: Printer },
  { to: '/scanning', label: 'Scan',      icon: ScanBarcode },
]

export default function Sidebar() {
  const [exporting, setExporting] = useState(false)

  const handleMasterExport = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const data = await getMasterExport()
      await exportMasterToExcel(data)
    } finally {
      setExporting(false)
    }
  }

  return (
    <aside className="w-64 bg-white border-r border-neutral-100 flex flex-col py-8 gap-1">

      <div className="flex items-center gap-4 px-6 mb-10">
        <img src="/favicon.svg" className="w-12 h-12 shrink-0" alt="Seeder Blueberry" />
        <div>
          <p className="text-neutral-900" style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.3px' }}>
            Seeder
          </p>
          <p className="text-neutral-900" style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px', fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.3px' }}>
            Blueberry
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1 px-4">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-4 pl-[34px] pr-4 py-3 rounded-lg text-base font-semibold transition-colors w-full
              ${isActive
                ? 'bg-primary-700 text-white'
                : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800'
              }`
            }
          >
            <Icon size={24} strokeWidth={2.5} className="w-6 shrink-0" />
            {label}
          </NavLink>
        ))}
      </div>

      {/* Master export — pinned to bottom */}
      <div className="mt-auto px-4">
        <div className="border-t border-neutral-100 mb-4" />
        <button
          onClick={handleMasterExport}
          disabled={exporting}
          className="flex items-center gap-4 pl-[34px] pr-4 py-3 rounded-lg text-base font-semibold transition-colors w-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <FileDown size={24} strokeWidth={2.5} className="w-6 shrink-0" />
          {exporting ? 'Exporting…' : 'Export All'}
        </button>
      </div>

    </aside>
  )
}