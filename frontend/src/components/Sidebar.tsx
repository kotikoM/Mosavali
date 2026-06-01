import { NavLink } from 'react-router-dom'
import { LayoutDashboard, ScanBarcode, Printer, Users } from 'lucide-react'

const links = [
  { to: '/',         label: 'Dashboard', icon: LayoutDashboard },
  { to: '/pickers',  label: 'Picker',   icon: Users },
  { to: '/printing', label: 'Sticker',  icon: Printer },
  { to: '/scanning', label: 'Scan',  icon: ScanBarcode },
]

export default function Sidebar() {
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
            <Icon size={24} strokeWidth={2.5} />
            {label}
          </NavLink>
        ))}
      </div>

    </aside>
  )
}