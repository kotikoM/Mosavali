import { format } from 'date-fns'

const TBILISI = 'Asia/Tbilisi'

/** "YYYY-MM-DD HH:MM" in Tbilisi time — for datetime columns (scanned_at, printed_at) */
export function fmtTbilisiTime(iso: string): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: TBILISI,
    year:     'numeric',
    month:    '2-digit',
    day:      '2-digit',
    hour:     '2-digit',
    minute:   '2-digit',
  }).format(new Date(iso))
}

/** "YYYY-MM-DD" in Tbilisi time — for date range keys and column headers */
export function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: TBILISI,
    year:     'numeric',
    month:    '2-digit',
    day:      '2-digit',
  }).format(d)
}

/** Today as "YYYY-MM-DD" in Tbilisi time — safe zero-arg state initializer */
export function todayTbilisi(): string {
  return fmtDate(new Date())
}