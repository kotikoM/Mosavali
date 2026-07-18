import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import { format, parseISO } from 'date-fns'
import type { PickerBoxStat, PickerDetailExportRow } from '../api/harvest'

// ── Types ─────────────────────────────────────────────────────────────

export interface MasterExportField {
  field_id:    number
  field_name:  string
  description: string | null
  total_boxes: number
  total_kg:    number
}

export interface MasterExportBox {
  box_id:          number
  name:            string
  empty_weight_kg: number
  full_weight_kg:  number
  net_weight_kg:   number
  description:     string | null
  total_scanned:   number
}

export interface MasterExportPrintBatch {
  picker_id:       number
  picker_name:     string
  national_id:     string
  box_number_from: number
  box_number_to:   number
  quantity:        number
  printed_at:      string
}

export interface MasterExportData {
  picker_box_stats: PickerBoxStat[]
  picker_detail:    PickerDetailExportRow[]
  fields:           MasterExportField[]
  boxes:            MasterExportBox[]
  print_batches:    MasterExportPrintBatch[]
}

// ── Helpers ───────────────────────────────────────────────────────────

function col(n: number): string {
  let s = ''
  while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) }
  return s
}

const fill = (argb: string): ExcelJS.Fill =>
  ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })

function fmtTbilisi(date: Date | string): string {
  let d: Date
  if (typeof date === 'string') {
    const utc = /Z|[+-]\d{2}:?\d{2}$/.test(date) ? date : date + 'Z'
    d = new Date(utc)
  } else {
    d = date
  }
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tbilisi',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).format(d).replace('T', '  ')
}

// ── Palette ───────────────────────────────────────────────────────────

const G = {
  headerBg:     'FF4A7C45',
  headerDay:    'FF8CB885',
  headerBorder: 'FF3D6439',
  titleBg:      'FFF2F8F1',
  border:       'FFD9EAD7',
  borderDay:    'FFC5DFBF',
  rowOdd:       'FFF6FAF5',
  rowEven:      'FFFFFFFF',
  dayColBg:     'FFF0F7EE',
  dayColBgOdd:  'FFE8F4E6',
  summaryBg:    'FFD0E8CB',
  summaryBorder:'FFB0D4A8',
  entryOdd:     'FFF7FAF6',
  entryEven:    'FFFFFFFF',
  entryBorder:  'FFEEEEEE',
  entryHeader:  'FFF0F0F0',
  totalBg:      'FF3D6439',
  inputTableHdr:'FF5C8A56',
  inputBg:      'FFEEF6ED',
  black:        'FF000000',
  white:        'FFFFFFFF',
  green:        'FF2D5A27',
  blue:         'FF1D4ED8',
  amber:        'FFFBBF24',
  amberBg:      'FFFFFBEB',
  indentGreen:  'FF8CB885',
}

const FONT = 'Arial'

// ── Shared header builder ─────────────────────────────────────────────

function writeHeader(ws: ExcelJS.Worksheet, title: string, subtitle: string, lastColNum: number) {
  const LAST = col(lastColNum)

  ws.mergeCells(`A1:${LAST}1`)
  const t     = ws.getCell('A1')
  t.value     = title
  t.font      = { name: FONT, size: 13, bold: true, color: { argb: G.black } }
  t.fill      = fill(G.titleBg)
  t.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  t.border    = { bottom: { style: 'thin', color: { argb: G.border } } }
  ws.getRow(1).height = 30

  ws.mergeCells(`A2:${LAST}2`)
  const info     = ws.getCell('A2')
  info.value     = subtitle
  info.font      = { name: FONT, size: 8, color: { argb: 'FFAAAAAA' } }
  info.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  ws.getRow(2).height = 14

  ws.getRow(3).height = 6
}

// ── Sheet 1: Daily Harvest ────────────────────────────────────────────

function buildDailyHarvestSheet(wb: ExcelJS.Workbook, data: PickerBoxStat[]) {
  const ws = wb.addWorksheet('Daily Harvest')

  const allBoxTypes = Array.from(new Set(data.flatMap(p => Object.keys(p.total_box_types)))).sort()
  const boxNetWeights: Record<string, number> = {}
  for (const picker of data)
    for (const dayData of Object.values(picker.days))
      for (const [name, info] of Object.entries(dayData.box_types))
        if (!(name in boxNetWeights)) boxNetWeights[name] = info.net_weight_kg

  const dailyColumns = Array.from(new Set(data.flatMap(p => Object.keys(p.days)))).sort()

  // NOTE column sits right after Bank Info — every fixed column from
  // Total kg onward is shifted by one vs. the pre-Note layout.
  const KG_COL = 8, SALARY_COL = 9, BOXES_COL = 10, PRICE_ROW = 5, HEADER_ROW = 7, DATA_START = 8
  const FIXED_COLS = 10 + allBoxTypes.length
  const TOTAL_COLS = FIXED_COLS + dailyColumns.length

  writeHeader(ws, 'Daily Harvest — All Time', `Exported ${fmtTbilisi(new Date())}  ·  ${data.length} pickers`, TOTAL_COLS)

  ws.getRow(4).height = 4
  ws.mergeCells('A5:B5')
  const priceLabel = ws.getCell('A5')
  priceLabel.value = 'Price per kg'
  priceLabel.font  = { name: FONT, size: 9, bold: true, color: { argb: G.black } }
  priceLabel.alignment = { horizontal: 'right', vertical: 'middle' }

  const priceVal = ws.getCell('C5')
  priceVal.value = 0
  priceVal.font  = { name: FONT, size: 11, bold: true, color: { argb: G.blue } }
  priceVal.fill  = fill(G.amberBg)
  priceVal.numFmt    = '#,##0.00 "GEL"'
  priceVal.alignment = { horizontal: 'center', vertical: 'middle' }
  priceVal.border    = { top: { style: 'thin', color: { argb: G.amber } }, bottom: { style: 'thin', color: { argb: G.amber } }, left: { style: 'thin', color: { argb: G.amber } }, right: { style: 'thin', color: { argb: G.amber } } }

  ws.mergeCells('D5:H5')
  const priceHint = ws.getCell('D5')
  priceHint.value = '  ← edit to recalculate salaries'
  priceHint.font  = { name: FONT, size: 8, italic: true, color: { argb: 'FFAAAAAA' } }
  priceHint.alignment = { horizontal: 'left', vertical: 'middle' }
  ws.getRow(5).height = 22
  ws.getRow(6).height = 4

  const headerDefs = [
    { label: '#', width: 4 }, { label: 'Name', width: 24 }, { label: 'National ID', width: 14 },
    { label: 'Phone', width: 13 }, { label: 'Origin', width: 14 }, { label: 'Bank Info', width: 26 },
    { label: 'Note', width: 22 },
    { label: 'Total kg', width: 11 }, { label: 'Salary (GEL)', width: 15 }, { label: 'Total Boxes', width: 12 },
    ...allBoxTypes.map(bt => ({ label: `${bt} (${boxNetWeights[bt] != null ? boxNetWeights[bt] + 'kg' : '?'})`, width: 14 })),
  ]

  const hRow = ws.getRow(HEADER_ROW)
  hRow.height = 22
  headerDefs.forEach(({ label, width }, i) => {
    const c = hRow.getCell(i + 1)
    c.value = label; c.font = { name: FONT, size: 9, bold: true, color: { argb: G.white } }
    c.fill = fill(G.headerBg); c.alignment = { horizontal: i <= 1 ? 'left' : 'center', vertical: 'middle', indent: i <= 1 ? 1 : 0 }
    c.border = { right: { style: 'thin', color: { argb: G.headerBorder } } }
    ws.getColumn(i + 1).width = width
  })

  dailyColumns.forEach((day, di) => {
    const n = FIXED_COLS + di + 1
    const c = hRow.getCell(n)
    c.value = format(parseISO(day), 'MMM d'); c.font = { name: FONT, size: 9, bold: true, color: { argb: G.white } }
    c.fill = fill(G.headerDay); c.alignment = { horizontal: 'center', vertical: 'middle' }
    c.border = { right: { style: 'thin', color: { argb: 'FF7AAD73' } } }
    ws.getColumn(n).width = 9
  })

  data.forEach((p, idx) => {
    const rowN = DATA_START + idx, isOdd = idx % 2 === 1, bg = isOdd ? G.rowOdd : G.rowEven
    const r = ws.getRow(rowN); r.height = 18

    function dc(colN: number, value: ExcelJS.CellValue, opts: { bold?: boolean; numFmt?: string; align?: ExcelJS.Alignment['horizontal']; color?: string } = {}) {
      const c = r.getCell(colN); c.value = value; c.fill = fill(bg)
      c.font = { name: FONT, size: 10, bold: opts.bold, color: { argb: opts.color ?? G.black } }
      c.numFmt = opts.numFmt ?? ''; c.alignment = { horizontal: opts.align ?? 'left', vertical: 'middle', indent: (!opts.align || opts.align === 'left') ? 1 : 0 }
      c.border = { bottom: { style: 'thin', color: { argb: G.border } }, right: { style: 'thin', color: { argb: G.border } } }
    }

    dc(1, idx + 1, { align: 'center' }); dc(2, `${p.last_name} ${p.first_name}`, { bold: true })
    dc(3, p.national_id, { align: 'center' }); dc(4, p.phone ?? '', { align: 'center' })
    dc(5, p.origin_place ?? ''); dc(6, p.bank_info ?? ''); dc(7, p.note ?? '')
    dc(KG_COL, p.total_kg, { bold: true, numFmt: '#,##0.0', align: 'right' })

    const sc = r.getCell(SALARY_COL)
    sc.value = { formula: `=${col(KG_COL)}${rowN}*$C$${PRICE_ROW}`, result: p.total_kg }
    sc.fill = fill(bg); sc.font = { name: FONT, size: 10, bold: true, color: { argb: G.blue } }
    sc.numFmt = '#,##0.00 "GEL"'; sc.alignment = { horizontal: 'right', vertical: 'middle' }
    sc.border = { bottom: { style: 'thin', color: { argb: G.border } }, right: { style: 'thin', color: { argb: G.border } } }

    dc(BOXES_COL, p.total_boxes, { align: 'right', numFmt: '#,##0' })
    allBoxTypes.forEach((bt, bti) => dc(BOXES_COL + 1 + bti, p.total_box_types[bt] ?? 0, { align: 'right', numFmt: '#,##0' }))

    dailyColumns.forEach((day, di) => {
      const n = FIXED_COLS + di + 1, dayData = p.days[day], hasKg = dayData && dayData.kg > 0
      const dc2 = r.getCell(n)
      dc2.value = hasKg ? dayData.kg : null; dc2.fill = fill(isOdd ? G.dayColBgOdd : G.dayColBg)
      dc2.font = { name: FONT, size: 9, bold: !!hasKg, color: { argb: G.black } }; dc2.numFmt = '#,##0.0'
      dc2.alignment = { horizontal: 'center', vertical: 'middle' }
      dc2.border = { bottom: { style: 'thin', color: { argb: G.borderDay } }, right: { style: 'thin', color: { argb: G.borderDay } } }
    })
  })

  const totN = DATA_START + data.length; ws.getRow(totN).height = 20
  function tc(colN: number, value: ExcelJS.CellValue | null, opts: { numFmt?: string; formula?: string; highlight?: boolean; dayCol?: boolean } = {}) {
    const c = ws.getRow(totN).getCell(colN)
    c.value = opts.formula ? { formula: opts.formula, result: 0 } : value as ExcelJS.CellValue
    c.fill = fill(opts.dayCol ? G.headerDay : G.totalBg)
    c.font = { name: FONT, size: 10, bold: true, color: { argb: opts.highlight ? G.amber : G.white } }
    c.numFmt = opts.numFmt ?? ''; c.alignment = { horizontal: colN <= 2 ? 'left' : 'right', vertical: 'middle', indent: colN <= 2 ? 1 : 0 }
    c.border = { top: { style: 'medium', color: { argb: 'FF2D5229' } } }
  }

  tc(1, 'TOTAL'); tc(2, `${data.length} pickers`); for (let i = 3; i <= 7; i++) tc(i, null)
  tc(KG_COL, null, { numFmt: '#,##0.0', formula: `=SUM(${col(KG_COL)}${DATA_START}:${col(KG_COL)}${totN - 1})` })
  tc(SALARY_COL, null, { numFmt: '#,##0.00 "GEL"', formula: `=SUM(${col(SALARY_COL)}${DATA_START}:${col(SALARY_COL)}${totN - 1})`, highlight: true })
  tc(BOXES_COL, null, { numFmt: '#,##0', formula: `=SUM(${col(BOXES_COL)}${DATA_START}:${col(BOXES_COL)}${totN - 1})` })
  allBoxTypes.forEach((_, bti) => { const c = BOXES_COL + 1 + bti; tc(c, null, { numFmt: '#,##0', formula: `=SUM(${col(c)}${DATA_START}:${col(c)}${totN - 1})` }) })
  dailyColumns.forEach((_, di) => { const n = FIXED_COLS + di + 1; tc(n, null, { numFmt: '#,##0.0', formula: `=SUM(${col(n)}${DATA_START}:${col(n)}${totN - 1})`, dayCol: true }) })
}

// ── Sheet 2: Sticker Detail ───────────────────────────────────────────

function buildStickerDetailSheet(wb: ExcelJS.Workbook, data: PickerDetailExportRow[]) {
  const ws = wb.addWorksheet('All Sticker')
  const allBoxTypes = Array.from(new Set(data.flatMap(p => p.box_type_summary.map(b => b.box_name)))).sort()
  const boxNetWeights: Record<string, number> = {}
  for (const picker of data) for (const b of picker.box_type_summary) if (!(b.box_name in boxNetWeights)) boxNetWeights[b.box_name] = b.net_weight_kg

  const BOX_START = 7, TOTAL_KG_COL = BOX_START + allBoxTypes.length, TOTAL_COLS = TOTAL_KG_COL
  const totalBoxesAll = data.reduce((s, p) => s + p.total_boxes, 0)
  const totalKgAll    = data.reduce((s, p) => s + p.total_kg, 0)

  writeHeader(ws, 'All Stickers', `Exported ${fmtTbilisi(new Date())}  ·  ${data.length} pickers  ·  ${totalBoxesAll.toLocaleString()} boxes  ·  ${Math.round(totalKgAll * 10) / 10} kg total`, TOTAL_COLS)

  const HEADER_ROW = 4, DATA_START = 5
  const headerDefs = [
    { label: '', width: 4 }, { label: 'Name', width: 24 }, { label: 'National ID', width: 15 },
    { label: 'Origin', width: 14 }, { label: 'Phone', width: 14 }, { label: 'Note', width: 20 },
    { label: 'Total Boxes', width: 21 },
    ...allBoxTypes.map(bt => ({ label: `${bt} (${boxNetWeights[bt] ?? '?'}kg)`, width: 15 })),
    { label: 'Total KG', width: 12 },
  ]

  const hRow = ws.getRow(HEADER_ROW); hRow.height = 22
  headerDefs.forEach(({ label, width }, i) => {
    const c = hRow.getCell(i + 1); c.value = label
    c.font = { name: FONT, size: 9, bold: true, color: { argb: G.white } }; c.fill = fill(G.headerBg)
    c.alignment = { horizontal: i <= 1 ? 'left' : 'center', vertical: 'middle', indent: i <= 1 ? 1 : 0 }
    c.border = { right: { style: 'thin', color: { argb: G.headerBorder } }, bottom: { style: 'medium', color: { argb: G.headerBorder } } }
    ws.getColumn(i + 1).width = width
  })

  let rowN = DATA_START
  const summaryBorder: Partial<ExcelJS.Borders> = { top: { style: 'medium', color: { argb: G.summaryBorder } }, bottom: { style: 'thin', color: { argb: G.summaryBorder } }, right: { style: 'thin', color: { argb: G.border } } }
  const entryBorderStyle: Partial<ExcelJS.Borders> = { bottom: { style: 'thin', color: { argb: G.entryBorder } }, right: { style: 'thin', color: { argb: G.entryBorder } } }
  const entryHeaderBorder: Partial<ExcelJS.Borders> = { bottom: { style: 'thin', color: { argb: 'FFDDDDDD' } }, right: { style: 'thin', color: { argb: 'FFDDDDDD' } } }
  const ENTRY_COL_LABELS: Record<number, string> = { 1: '', 2: 'Barcode', 3: 'Box Type', 4: 'Field', 5: 'Harvest Date', 6: 'Scan Date' }

  data.forEach((picker, pickerIdx) => {
    const boxCounts: Record<string, number> = {}
    for (const b of picker.box_type_summary) boxCounts[b.box_name] = b.count
    const sr = ws.getRow(rowN); sr.height = 21

    function sc(colN: number, value: ExcelJS.CellValue, opts: { bold?: boolean; align?: ExcelJS.Alignment['horizontal']; color?: string; numFmt?: string } = {}) {
      const c = sr.getCell(colN); c.value = value; c.fill = fill(G.summaryBg)
      c.font = { name: FONT, size: 10, bold: opts.bold, color: { argb: opts.color ?? G.black } }
      c.numFmt = opts.numFmt ?? ''; c.alignment = { horizontal: opts.align ?? 'left', vertical: 'middle', indent: (!opts.align || opts.align === 'left') ? 1 : 0 }
      c.border = summaryBorder
    }

    sc(1, pickerIdx + 1, { bold: true, align: 'center', color: G.green }); sc(2, `${picker.last_name} ${picker.first_name}`, { bold: true })
    sc(3, picker.national_id, { align: 'center' }); sc(4, picker.origin_place ?? '—'); sc(5, picker.phone, { align: 'center' })
    sc(6, picker.note ?? '—')
    sc(7, picker.total_boxes, { bold: true, align: 'right', numFmt: '#,##0' })
    allBoxTypes.forEach((bt, bti) => sc(BOX_START + bti, boxCounts[bt] ?? 0, { align: 'right', numFmt: '#,##0' }))
    sc(TOTAL_KG_COL, picker.total_kg, { bold: true, align: 'right', numFmt: '#,##0.0', color: G.green })
    rowN++

    if (picker.entries.length > 0) {
      const ehr = ws.getRow(rowN); ehr.height = 13
      for (let c = 1; c <= TOTAL_COLS; c++) {
        const cell = ehr.getCell(c); cell.value = ENTRY_COL_LABELS[c] ?? ''
        cell.fill = fill(G.entryHeader); cell.font = { name: FONT, size: 8, bold: true, color: { argb: 'FF9CA3AF' } }
        cell.alignment = { horizontal: c === 5 ? 'center' : 'left', vertical: 'middle', indent: c >= 2 && c <= 4 ? 2 : 0 }
        cell.border = entryHeaderBorder
      }
      rowN++
    }

    picker.entries.forEach((entry, ei) => {
      const er = ws.getRow(rowN); er.height = 15; const bg = ei % 2 === 0 ? G.entryOdd : G.entryEven
      for (let c = 1; c <= TOTAL_COLS; c++) { const cell = er.getCell(c); cell.fill = fill(bg); cell.border = entryBorderStyle }
      function ec(colN: number, value: ExcelJS.CellValue, opts: { bold?: boolean; align?: ExcelJS.Alignment['horizontal'] } = {}) {
        const c = er.getCell(colN); c.value = value; c.fill = fill(bg)
        c.font = { name: FONT, size: 9, bold: opts.bold, color: { argb: G.black } }
        c.alignment = { horizontal: opts.align ?? 'left', vertical: 'middle', indent: (!opts.align || opts.align === 'left') ? 2 : 0 }
        c.border = entryBorderStyle
      }
      ec(1, '↳', { align: 'center' }); ec(2, entry.barcode, { bold: true }); ec(3, `${entry.box_name} (${entry.net_weight_kg}kg)`)
      ec(4, entry.field_name); ec(5, entry.harvest_date, { align: 'center' }); ec(6, fmtTbilisi(entry.scanned_at), { align: 'center' })
      rowN++
    })
  })

  const gtr = ws.getRow(rowN); gtr.height = 22
  function gtc(colN: number, value: ExcelJS.CellValue | null, opts: { numFmt?: string; highlight?: boolean } = {}) {
    const c = gtr.getCell(colN); c.value = value as ExcelJS.CellValue; c.fill = fill(G.headerBg)
    c.font = { name: FONT, size: 10, bold: true, color: { argb: opts.highlight ? G.amber : G.white } }
    c.numFmt = opts.numFmt ?? ''; c.alignment = { horizontal: colN <= 2 ? 'left' : 'right', vertical: 'middle', indent: colN <= 2 ? 1 : 0 }
    c.border = { top: { style: 'medium', color: { argb: G.headerBorder } } }
  }

  gtc(1, 'TOTAL'); gtc(2, `${data.length} pickers`); for (let c = 3; c <= 6; c++) gtc(c, null)
  gtc(7, totalBoxesAll, { numFmt: '#,##0' })
  allBoxTypes.forEach((bt, bti) => gtc(BOX_START + bti, data.reduce((s, p) => s + (p.box_type_summary.find(x => x.box_name === bt)?.count ?? 0), 0), { numFmt: '#,##0' }))
  gtc(TOTAL_KG_COL, Math.round(totalKgAll * 10) / 10, { numFmt: '#,##0.0', highlight: true })
}

// ── Simple table builder ──────────────────────────────────────────────

interface ColDef {
  label: string; width: number; key: string
  numFmt?: string; align?: ExcelJS.Alignment['horizontal']
  mono?: boolean; bold?: boolean; color?: string
}

function buildSimpleSheet(wb: ExcelJS.Workbook, sheetName: string, title: string, subtitle: string, columns: ColDef[], rows: Record<string, any>[], totalKeys?: string[]) {
  const ws = wb.addWorksheet(sheetName)
  const TOTAL_COLS = columns.length, HEADER_ROW = 4, DATA_START = 5
  writeHeader(ws, title, subtitle, TOTAL_COLS)
  const hRow = ws.getRow(HEADER_ROW); hRow.height = 22
  columns.forEach(({ label, width }, i) => {
    const c = hRow.getCell(i + 1); c.value = label
    c.font = { name: FONT, size: 9, bold: true, color: { argb: G.white } }; c.fill = fill(G.headerBg)
    c.alignment = { horizontal: i <= 1 ? 'left' : 'center', vertical: 'middle', indent: i <= 1 ? 1 : 0 }
    c.border = { right: { style: 'thin', color: { argb: G.headerBorder } }, bottom: { style: 'medium', color: { argb: G.headerBorder } } }
    ws.getColumn(i + 1).width = width
  })
  rows.forEach((row, idx) => {
    const rowN = DATA_START + idx, bg = idx % 2 === 1 ? G.rowOdd : G.rowEven
    const r = ws.getRow(rowN); r.height = 18
    columns.forEach(({ key, align, bold, color, numFmt }, i) => {
      const c = r.getCell(i + 1); c.value = row[key] ?? null; c.fill = fill(bg)
      c.font = { name: FONT, size: 10, bold: bold ?? false, color: { argb: color ?? G.black } }
      c.numFmt = numFmt ?? ''; c.alignment = { horizontal: align ?? (i <= 1 ? 'left' : 'center'), vertical: 'middle', indent: (align ?? (i <= 1 ? 'left' : 'center')) === 'left' ? 1 : 0 }
      c.border = { bottom: { style: 'thin', color: { argb: G.border } }, right: { style: 'thin', color: { argb: G.border } } }
    })
  })
  if (totalKeys?.length) {
    const totN = DATA_START + rows.length; const tr = ws.getRow(totN); tr.height = 20
    columns.forEach(({ key, numFmt }, i) => {
      const c = tr.getCell(i + 1); const isSum = totalKeys.includes(key)
      c.value = i === 0 ? 'TOTAL' : isSum ? rows.reduce((s, r) => s + (r[key] ?? 0), 0) : null
      c.fill = fill(G.totalBg); c.font = { name: FONT, size: 10, bold: true, color: { argb: G.white } }
      c.numFmt = isSum ? (numFmt ?? '') : ''; c.alignment = { horizontal: i <= 1 ? 'left' : 'right', vertical: 'middle', indent: i <= 1 ? 1 : 0 }
      c.border = { top: { style: 'medium', color: { argb: 'FF2D5229' } } }
    })
  }
}

function buildFieldsSheet(wb: ExcelJS.Workbook, data: MasterExportField[]) {
  buildSimpleSheet(wb, 'Fields', 'Fields', `Exported ${fmtTbilisi(new Date())}  ·  ${data.length} fields`,
    [{ label: '#', key: '_idx', width: 5, align: 'center' }, { label: 'Field Name', key: 'field_name', width: 24 }, { label: 'Description', key: 'description', width: 30 },
     { label: 'Total Boxes', key: 'total_boxes', width: 13, align: 'right', numFmt: '#,##0' }, { label: 'Total KG', key: 'total_kg', width: 13, align: 'right', numFmt: '#,##0.0', bold: true, color: G.green }],
    data.map((r, i) => ({ ...r, _idx: i + 1, description: r.description ?? '—' })), ['total_boxes', 'total_kg'])
}

function buildBoxTypesSheet(wb: ExcelJS.Workbook, data: MasterExportBox[]) {
  buildSimpleSheet(wb, 'Box Types', 'Box Types', `Exported ${fmtTbilisi(new Date())}  ·  ${data.length} box types`,
    [{ label: '#', key: '_idx', width: 5, align: 'center' }, { label: 'Name', key: 'name', width: 20 },
     { label: 'Net Weight kg', key: 'net_weight_kg', width: 15, align: 'right', numFmt: '#,##0.000', bold: true, color: G.green },
     { label: 'Empty kg', key: 'empty_weight_kg', width: 12, align: 'right', numFmt: '#,##0.000' },
     { label: 'Full kg', key: 'full_weight_kg', width: 12, align: 'right', numFmt: '#,##0.000' },
     { label: 'Description', key: 'description', width: 30 }, { label: 'Total Scanned', key: 'total_scanned', width: 14, align: 'right', numFmt: '#,##0' }],
    data.map((r, i) => ({ ...r, _idx: i + 1, description: r.description ?? '—' })), ['total_scanned'])
}

function buildPrintBatchesSheet(wb: ExcelJS.Workbook, data: MasterExportPrintBatch[]) {
  buildSimpleSheet(wb, 'Print Batches', 'Print Batches',
    `Exported ${fmtTbilisi(new Date())}  ·  ${data.length} batches  ·  ${data.reduce((s, r) => s + r.quantity, 0).toLocaleString()} stickers total`,
    [{ label: '#', key: '_idx', width: 5, align: 'center' }, { label: 'Picker', key: 'picker_name', width: 22 },
     { label: 'National ID', key: 'national_id', width: 15, align: 'center' },
     { label: 'Box From', key: 'box_number_from', width: 11, align: 'right', numFmt: '#,##0' },
     { label: 'Box To', key: 'box_number_to', width: 11, align: 'right', numFmt: '#,##0' },
     { label: 'Quantity', key: 'quantity', width: 11, align: 'right', numFmt: '#,##0', bold: true },
     { label: 'Printed At', key: 'printed_at', width: 22, align: 'center' }],
    data.map((r, i) => ({ ...r, _idx: i + 1, printed_at: fmtTbilisi(r.printed_at) })), ['quantity'])
}

// ── Sheet 6: ხარჯები ─────────────────────────────────────────────────

function buildKhardzebiSheet(wb: ExcelJS.Workbook, data: MasterExportData) {
  const ws = wb.addWorksheet('ხარჯები')

  // ── Collect & filter data ──────────────────────────────────────
  const allBoxTypes = Array.from(new Set(
    data.picker_box_stats.flatMap(p => Object.values(p.days).flatMap(d => Object.keys(d.box_types)))
  )).sort()

  const fieldDescMap: Record<string, string> = {}
  for (const f of data.fields) fieldDescMap[f.field_name] = f.description ?? f.field_name

  const daySpeciesSet: Record<string, Set<string>> = {}
  for (const picker of data.picker_detail)
    for (const entry of picker.entries) {
      if (!daySpeciesSet[entry.harvest_date]) daySpeciesSet[entry.harvest_date] = new Set()
      daySpeciesSet[entry.harvest_date].add(fieldDescMap[entry.field_name] ?? entry.field_name)
    }

  interface DayRow { total_kg: number; box_counts: Record<string, number> }
  const dayMap: Record<string, DayRow> = {}
  for (const picker of data.picker_box_stats)
    for (const [date, day] of Object.entries(picker.days)) {
      if (!dayMap[date]) dayMap[date] = { total_kg: 0, box_counts: {} }
      dayMap[date].total_kg += day.kg
      for (const [boxName, info] of Object.entries(day.box_types))
        dayMap[date].box_counts[boxName] = (dayMap[date].box_counts[boxName] ?? 0) + info.count
    }
  for (const d of Object.values(dayMap)) d.total_kg = Math.round(d.total_kg * 1000) / 1000

  // Only include box types that actually have at least one harvest
  const boxTypeTotals: Record<string, number> = {}
  for (const day of Object.values(dayMap))
    for (const [bt, cnt] of Object.entries(day.box_counts))
      boxTypeTotals[bt] = (boxTypeTotals[bt] ?? 0) + cnt
  const activeBoxTypes = allBoxTypes.filter(bt => (boxTypeTotals[bt] ?? 0) > 0)
  const n = activeBoxTypes.length

  const sortedDates = Object.keys(dayMap).sort()

  // ── Row layout ─────────────────────────────────────────────────
  // 1-3  : title
  // 4    : spacer
  // 5    : input table header [ყუთის სახელი | ყუთის ფასი | ტარა ყუთში]
  // 6+i  : one row per active box type (i = 0..n-1)
  // 6+n  : spacer
  // 7+n  : separate inputs [ტარის ფასი label | input | | მკრეფის label | input]
  // 8+n  : spacer
  // 9+n  : column headers   ← HEADER_ROW
  // 10+n : data rows        ← DATA_START

  const INPUT_TBL_HDR  = 5
  const INPUT_FIRST    = 6
  const SEP_INPUT_ROW  = 7 + n
  const HEADER_ROW     = 9 + n
  const DATA_START     = 10 + n

  // Input table columns
  const IN_NAME_COL  = 1   // A: box type name
  const IN_PRICE_COL = 2   // B: box price input    (row per type)
  const IN_PPBOX_COL = 3   // C: punnets/box input  (row per type)
  // Separate inputs row:
  const SEP_PNTPRC_COL  = 2   // B: punnet price
  const SEP_SAL_LBL_COL = 4   // D: salary label
  const SEP_SAL_COL     = 5   // E: salary input

  // Absolute refs into input area
  const boxPriceRef = (i: number) => `$${col(IN_PRICE_COL)}$${INPUT_FIRST + i}`
  const ppboxRef    = (i: number) => `$${col(IN_PPBOX_COL)}$${INPUT_FIRST + i}`
  const pntPriceRef = `$${col(SEP_PNTPRC_COL)}$${SEP_INPUT_ROW}`
  const salaryRef   = `$${col(SEP_SAL_COL)}$${SEP_INPUT_ROW}`

  // ── Data table column layout ───────────────────────────────────
  // Col 1          : Date
  // Col 2          : Species
  // Col 3          : Net KG
  // Col 4..3+n     : Box counts (one per active type; blank if 0)
  // Col 4+n        : Box price total   ← single column, formula
  // Col 5+n        : Punnet price total ← single column, formula
  // Col 6+n        : Picker expenses   ← formula
  // Col 7+n        : Row total         ← formula

  const DATE_COL       = 1
  const SPECIES_COL    = 2
  const KG_COL         = 3
  const BOX_CNT_START  = 4
  const BOX_PRICE_COL  = 4 + n    // single unified column
  const PUNNET_PRC_COL = 5 + n    // single unified column
  const PICKER_EXP_COL = 6 + n
  const TOTAL_COL      = 7 + n
  const TOTAL_COLS     = TOTAL_COL

  // ── Dynamic column widths ──────────────────────────────────────
  const maxBTLen = Math.max(...activeBoxTypes.map(bt => bt.length), 10)
  const cntColW  = Math.max(14, maxBTLen + 4)   // count col: fits box name
  const priceColW = 16                           // unified price cols

  // ── Title ──────────────────────────────────────────────────────
  writeHeader(ws, 'ხარჯები',
    `ექსპორტი: ${fmtTbilisi(new Date())}  ·  ${sortedDates.length} სამუშაო დღე`,
    TOTAL_COLS)

  ws.getRow(4).height = 8

  // ── Input table ────────────────────────────────────────────────
  ws.getRow(INPUT_TBL_HDR).height = 20
  ;['ყუთის სახელი', 'ყუთის ფასი', 'პუნეტი ყუთში'].forEach((label, i) => {
    const c = ws.getRow(INPUT_TBL_HDR).getCell(i + 1)
    c.value = label
    c.font  = { name: FONT, size: 9, bold: true, color: { argb: G.white } }
    c.fill  = fill(G.inputTableHdr)
    c.alignment = { horizontal: i === 0 ? 'left' : 'center', vertical: 'middle', indent: i === 0 ? 1 : 0 }
    c.border = { bottom: { style: 'medium', color: { argb: G.headerBorder } }, right: { style: 'thin', color: { argb: G.headerBorder } } }
  })

  activeBoxTypes.forEach((bt, i) => {
    const rowN = INPUT_FIRST + i
    const r    = ws.getRow(rowN)
    r.height   = 26

    const nc = r.getCell(IN_NAME_COL)
    nc.value = bt; nc.font = { name: FONT, size: 10, bold: true, color: { argb: G.black } }
    nc.fill = fill(i % 2 === 0 ? G.rowEven : G.rowOdd)
    nc.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
    nc.border = { bottom: { style: 'thin', color: { argb: G.border } }, right: { style: 'thin', color: { argb: G.border } } }

    function inputC(colN: number, noteText: string) {
      const c = r.getCell(colN)
      c.value = 0; c.font = { name: FONT, size: 13, bold: true, color: { argb: G.blue } }
      c.fill = fill(G.amberBg); c.numFmt = '#,##0.00'
      c.alignment = { horizontal: 'center', vertical: 'middle' }
      c.border = { top: { style: 'thin', color: { argb: G.amber } }, bottom: { style: 'thin', color: { argb: G.amber } }, left: { style: 'thin', color: { argb: G.amber } }, right: { style: 'thin', color: { argb: G.amber } } }
      c.note = { texts: [{ text: noteText }] }
    }
    inputC(IN_PRICE_COL, `${bt}: ყუთის ფასი`)
    inputC(IN_PPBOX_COL, `${bt}: პუნეტი ყუთში (რაოდენობა)`)
  })

  ws.getRow(6 + n).height = 10

  // ── Separate inputs: punnet price + salary ─────────────────────
  ws.getRow(SEP_INPUT_ROW).height = 26

  function sepLabel(colN: number, text: string) {
    const c = ws.getRow(SEP_INPUT_ROW).getCell(colN)
    c.value = text; c.font = { name: FONT, size: 9, bold: true, color: { argb: G.black } }
    c.fill = fill(G.inputBg); c.alignment = { horizontal: 'right', vertical: 'middle' }
    c.border = { bottom: { style: 'thin', color: { argb: G.border } }, right: { style: 'thin', color: { argb: G.border } } }
  }
  function sepInput(colN: number, noteText: string) {
    const c = ws.getRow(SEP_INPUT_ROW).getCell(colN)
    c.value = 0; c.font = { name: FONT, size: 13, bold: true, color: { argb: G.blue } }
    c.fill = fill(G.amberBg); c.numFmt = '#,##0.00'
    c.alignment = { horizontal: 'center', vertical: 'middle' }
    c.border = { top: { style: 'thin', color: { argb: G.amber } }, bottom: { style: 'thin', color: { argb: G.amber } }, left: { style: 'thin', color: { argb: G.amber } }, right: { style: 'thin', color: { argb: G.amber } } }
    c.note = { texts: [{ text: noteText }] }
  }

  sepLabel(IN_NAME_COL,      'ერთი პუნეტის ფასი:')
  sepInput(SEP_PNTPRC_COL,   'ერთი პუნეტის ფასი')
  sepLabel(SEP_SAL_LBL_COL,  'მკრეფავის ხელფასი კგ-ზე:')
  sepInput(SEP_SAL_COL,      'მკრეფავის ხელფასი კგ-ზე')

  ws.getRow(SEP_INPUT_ROW + 1).height = 10

  // ── Column headers ─────────────────────────────────────────────
  const hRow = ws.getRow(HEADER_ROW); hRow.height = 36

  const colDefs: { colN: number; label: string; width: number }[] = [
    { colN: DATE_COL,       label: 'თარიღი',           width: Math.max(14, maxBTLen + 4) },
    { colN: SPECIES_COL,    label: 'კულტურა',          width: 24 },
    { colN: KG_COL,         label: 'წმინდა წონა კგ',   width: 18 },
    ...activeBoxTypes.map((bt, i) => ({
      colN: BOX_CNT_START + i, label: `${bt}\nყუთი`, width: cntColW,
    })),
    { colN: BOX_PRICE_COL,  label: 'ყუთების\nფასი',   width: priceColW },
    { colN: PUNNET_PRC_COL, label: 'პუნეტის\nფასი',   width: priceColW },
    { colN: PICKER_EXP_COL, label: 'მკრეფავის\nხარჯი',  width: priceColW },
    { colN: TOTAL_COL,      label: 'სულ ხარჯი',        width: priceColW },
  ]

  colDefs.forEach(({ colN, label, width }) => {
    const c = hRow.getCell(colN)
    c.value = label; c.font = { name: FONT, size: 9, bold: true, color: { argb: G.white } }
    c.fill = fill(G.headerBg)
    c.alignment = { horizontal: colN <= 2 ? 'left' : 'center', vertical: 'middle', wrapText: true, indent: colN <= 2 ? 1 : 0 }
    c.border = { right: { style: 'thin', color: { argb: G.headerBorder } }, bottom: { style: 'medium', color: { argb: G.headerBorder } } }
    ws.getColumn(colN).width = width
  })

  ws.getColumn(SEP_SAL_LBL_COL).width = Math.max((ws.getColumn(SEP_SAL_LBL_COL).width as number) ?? 0, 22)
  ws.getColumn(SEP_SAL_COL).width     = Math.max((ws.getColumn(SEP_SAL_COL).width as number) ?? 0, 16)

  // ── Data rows ──────────────────────────────────────────────────
  sortedDates.forEach((date, idx) => {
    const rowN  = DATA_START + idx
    const isOdd = idx % 2 === 1
    const bg    = isOdd ? G.rowOdd : G.rowEven
    const r     = ws.getRow(rowN); r.height = 18

    const day        = dayMap[date]
    const speciesTxt = Array.from(daySpeciesSet[date] ?? []).join(', ') || '—'

    function dc(colN: number, value: ExcelJS.CellValue | null, opts: {
      numFmt?: string; bold?: boolean; align?: ExcelJS.Alignment['horizontal']
      color?: string; formula?: string
    } = {}) {
      const c = r.getCell(colN)
      c.value = opts.formula ? { formula: opts.formula, result: 0 } : value as ExcelJS.CellValue
      c.fill  = fill(bg)
      c.font  = { name: FONT, size: 10, bold: opts.bold, color: { argb: opts.color ?? G.black } }
      c.numFmt    = opts.numFmt ?? ''
      c.alignment = {
        horizontal: opts.align ?? (colN <= 2 ? 'left' : 'right'),
        vertical:   'middle',
        indent:     (opts.align ?? (colN <= 2 ? 'left' : 'right')) === 'left' ? 1 : 0,
      }
      c.border = { bottom: { style: 'thin', color: { argb: G.border } }, right: { style: 'thin', color: { argb: G.border } } }
    }

    dc(DATE_COL,    format(parseISO(date), 'yyyy-MM-dd'), { align: 'center' })
    dc(SPECIES_COL, speciesTxt)
    dc(KG_COL,      day.total_kg, { numFmt: '#,##0.000', bold: true, color: G.green })

    // Box counts — blank when zero
    activeBoxTypes.forEach((bt, i) => {
      const cnt = day.box_counts[bt] ?? 0
      dc(BOX_CNT_START + i, cnt > 0 ? cnt : null, { numFmt: '#,##0' })
    })

    // Box price total = SUM(count_i × price_i) across all active types
    const boxPriceParts = activeBoxTypes.map((_, i) =>
      `${col(BOX_CNT_START + i)}${rowN}*${boxPriceRef(i)}`)
    dc(BOX_PRICE_COL, null, {
      formula: `=${boxPriceParts.join('+')}`,
      numFmt:  '#,##0.00', color: G.blue,
    })

    // Punnet price total = SUM(count_i × ppbox_i) × punnet_price
    const puntParts = activeBoxTypes.map((_, i) =>
      `${col(BOX_CNT_START + i)}${rowN}*${ppboxRef(i)}`)
    dc(PUNNET_PRC_COL, null, {
      formula: `=(${puntParts.join('+') || '0'})*${pntPriceRef}`,
      numFmt:  '#,##0.00', color: G.blue,
    })

    // Picker expenses = net_kg × salary
    dc(PICKER_EXP_COL, null, {
      formula: `=${col(KG_COL)}${rowN}*${salaryRef}`,
      numFmt:  '#,##0.00', bold: true, color: G.blue,
    })

    // Row total
    dc(TOTAL_COL, null, {
      formula: `=${col(BOX_PRICE_COL)}${rowN}+${col(PUNNET_PRC_COL)}${rowN}+${col(PICKER_EXP_COL)}${rowN}`,
      numFmt:  '#,##0.00', bold: true, color: G.green,
    })
  })

  // ── Totals row ─────────────────────────────────────────────────
  const totN = DATA_START + sortedDates.length
  ws.getRow(totN).height = 22

  function tc(colN: number, value: ExcelJS.CellValue | null, opts: { numFmt?: string; formula?: string; highlight?: boolean } = {}) {
    const c = ws.getRow(totN).getCell(colN)
    c.value = opts.formula ? { formula: opts.formula, result: 0 } : value as ExcelJS.CellValue
    c.fill  = fill(G.totalBg)
    c.font  = { name: FONT, size: 10, bold: true, color: { argb: opts.highlight ? G.amber : G.white } }
    c.numFmt    = opts.numFmt ?? ''
    c.alignment = { horizontal: colN <= 2 ? 'left' : 'right', vertical: 'middle', indent: colN <= 2 ? 1 : 0 }
    c.border    = { top: { style: 'medium', color: { argb: 'FF2D5229' } } }
  }

  const sr = (c: number) => `=SUM(${col(c)}${DATA_START}:${col(c)}${totN - 1})`

  tc(DATE_COL,    'სულ')
  tc(SPECIES_COL, `${sortedDates.length} დღე`)
  tc(KG_COL,           null, { formula: sr(KG_COL),           numFmt: '#,##0.000' })
  for (let i = 0; i < n; i++)
    tc(BOX_CNT_START + i, null, { formula: sr(BOX_CNT_START + i), numFmt: '#,##0' })
  tc(BOX_PRICE_COL,    null, { formula: sr(BOX_PRICE_COL),    numFmt: '#,##0.00' })
  tc(PUNNET_PRC_COL,   null, { formula: sr(PUNNET_PRC_COL),   numFmt: '#,##0.00' })
  tc(PICKER_EXP_COL,   null, { formula: sr(PICKER_EXP_COL),   numFmt: '#,##0.00', highlight: true })
  tc(TOTAL_COL,        null, { formula: sr(TOTAL_COL),         numFmt: '#,##0.00', highlight: true })
}

export async function exportMasterToExcel(data: MasterExportData) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Mosavali'; wb.created = new Date()
  wb.calcProperties = { fullCalcOnLoad: true }

  buildDailyHarvestSheet(wb,  data.picker_box_stats)
  buildStickerDetailSheet(wb, data.picker_detail)
  buildFieldsSheet(wb,        data.fields)
  buildBoxTypesSheet(wb,      data.boxes)
  buildPrintBatchesSheet(wb,  data.print_batches)
  buildKhardzebiSheet(wb,     data)

  const buf = await wb.xlsx.writeBuffer()
  saveAs(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `export_all_${new Date().toISOString().slice(0, 10)}.xlsx`,
  )
}