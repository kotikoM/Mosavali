export function fmtTbilisiTime(iso: string): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone:   'Asia/Tbilisi',
    year:       'numeric',
    month:      '2-digit',
    day:        '2-digit',
    hour:       '2-digit',
    minute:     '2-digit',
  }).format(new Date(iso))
}