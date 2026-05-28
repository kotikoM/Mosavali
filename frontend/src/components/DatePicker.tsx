import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { DayPicker } from 'react-day-picker'
import { format, parse, isValid } from 'date-fns'
import { CalendarDays } from 'lucide-react'
import 'react-day-picker/dist/style.css'

interface Props {
  value:    string
  onChange: (val: string) => void
  className?: string
}

export default function DatePicker({ value, onChange, className }: Props) {
  const [open, setOpen]             = useState(false)
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({})
  const triggerRef                  = useRef<HTMLDivElement>(null)
  const popupRef                    = useRef<HTMLDivElement>(null)

  const parsed  = parse(value, 'yyyy-MM-dd', new Date())
  const display = isValid(parsed) ? format(parsed, 'MMM dd, yyyy') : 'Select date'

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      const insideTrigger = triggerRef.current?.contains(target)
      const insidePopup   = popupRef.current?.contains(target)
      if (!insideTrigger && !insidePopup) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleOpen = () => {
    if (!open && triggerRef.current) {
      const rect       = triggerRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom

      if (spaceBelow >= 340) {
        setPopupStyle({
          position: 'fixed',
          top:      rect.bottom + 8,
          left:     rect.left,
          zIndex:   9999,
        })
      } else {
        setPopupStyle({
          position: 'fixed',
          bottom:   window.innerHeight - rect.top + 8,
          left:     rect.left,
          zIndex:   9999,
        })
      }
    }
    setOpen(o => !o)
  }

  return (
    <div ref={triggerRef} className="relative">
      <button
        type="button"
        onClick={handleOpen}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-medium outline-none transition-colors
          ${open
            ? 'border-primary bg-primary-50 text-primary-800'
            : 'border-neutral-200 bg-neutral-50 text-neutral-800 hover:border-primary hover:bg-primary-50'
          } ${className}`}
      >
        <CalendarDays size={15} strokeWidth={2.5} className="text-neutral-400 shrink-0" />
        {display}
      </button>

      {open && createPortal(
        <div
          ref={popupRef}
          style={popupStyle}
          className="bg-white rounded-2xl shadow-xl border border-neutral-100 p-3"
        >
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
        </div>,
        document.body
      )}
    </div>
  )
}