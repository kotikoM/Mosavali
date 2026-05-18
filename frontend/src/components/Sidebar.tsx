import { NavLink } from 'react-router-dom'
import { LayoutDashboard, ScanBarcode, Printer, Users, Apple, Box } from 'lucide-react'

const links = [
  { to: '/',          label: 'Dashboard', icon: LayoutDashboard },
  { to: '/scanning',  label: 'Scanning',  icon: ScanBarcode },
  { to: '/printing',  label: 'Printing',  icon: Printer },
  { to: '/pickers',   label: 'Pickers',   icon: Users },
  { to: '/fruits',    label: 'Fruits',    icon: Apple },
  { to: '/box-types', label: 'Box Types', icon: Box },
]

export default function Sidebar() {
  return (
    <aside className="w-64 bg-white border-r border-neutral-100 flex flex-col py-8 gap-1">

      {/* Logo */}
      <div className="flex items-center gap-4 px-6 mb-10">
        <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center shrink-0">
          <span className="text-white  text-lg font-bold">M</span>
        </div>
        <div>
          <p className="text-2xl font-bold text-neutral-800">Mosavali</p>
          <p className="text-sm text-neutral-400">Field Ops</p>
        </div>
      </div>

      {/* Nav links */}
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
            <Icon size={24} strokeWidth={2.5} />
            {label}
          </NavLink>
        ))}
      </div>

    </aside>
  )
}