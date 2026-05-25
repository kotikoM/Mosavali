import { useState, useRef, useEffect } from 'react'
import { DayPicker } from 'react-day-picker'
import { format, parse, isValid } from 'date-fns'
import { CalendarDays } from 'lucide-react'
import 'react-day-picker/dist/style.css'

interface Props {
  value:    string        // YYYY-MM-DD
  onChange: (val: string) => void
  className?: string
}

export default function DatePicker({ value, onChange, className }: Props) {
  const [open, setOpen] = useState(false)
  const ref             = useRef<HTMLDivElement>(null)

  const parsed  = parse(value, 'yyyy-MM-dd', new Date())
  const display = isValid(parsed) ? format(parsed, 'MMM dd, yyyy') : 'Select date'

  // close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">

      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-medium outline-none transition-colors
          ${open
            ? 'border-primary bg-primary-50 text-primary-800'
            : 'border-neutral-200 bg-neutral-50 text-neutral-800 hover:border-primary hover:bg-primary-50'
          } ${className}`}
      >
        <CalendarDays size={15} strokeWidth={2.5} className="text-neutral-400 shrink-0" />
        {display}
      </button>

      {/* Popup */}
      {open && (
        <div className="absolute top-full left-0 mt-2 z-50 bg-white rounded-2xl shadow-xl border border-neutral-100 p-3">
          <DayPicker
            mode="single"
            selected={isValid(parsed) ? parsed : undefined}
            onSelect={day => {
              if (day) {
                onChange(format(day, 'yyyy-MM-dd'))
                setOpen(false)
              }
            }}
            defaultMonth={isValid(parsed) ? parsed : new Date()}
          />
        </div>
      )}

    </div>
  )
}