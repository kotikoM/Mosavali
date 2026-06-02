import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import { format, parseISO } from 'date-fns'

export interface PickerDailyExportRow {
  picker_id: number
  first_name: string
  last_name: string
  national_id: string
  phone?: string | null
  bank_info?: string | null
  origin_place?: string | null
  total_kg: number
  total_boxes: number
  total_box_types: Record<string, number>
  days: Record<string, {
    kg: number
    box_types: Record<string, { count: number }>
  }>
}

function col(n: number): string {
  let s = ''
  while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) }
  return s
}

const fill = (argb: string): ExcelJS.Fill =>
  ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })

// Toned-down green palette
const G = {
  headerFixed:  'FF4A7C45',   // medium sage green — header for info cols
  headerDay:    'FF8CB885',   // soft muted green  — header for day cols
  rowOdd:       'FFF6FAF5',   // barely-there green tint
  rowEven:      'FFFFFFFF',   // white
  dayColBg:     'FFF0F7EE',   // faint green wash on day columns
  dayColBgOdd:  'FFE8F4E6',   // slightly deeper for odd rows in day cols
  kgText:       'FF3A6B36',   // dark-ish muted green for kg values
  dayText:      'FF4A7C45',   // day cell text
  titleBg:      'FFF2F8F1',   // near-white green tint for title row
  totalBg:      'FF3D6439',   // slightly muted dark green for totals
  border:       'FFD9EAD7',   // soft green-tinted border
  borderDay:    'FFC5DFBF',   // slightly stronger border between day cols
  white:        'FFFFFFFF',
  dark:         'FF1C2B1A',
  mid:          'FF5C6E5A',
  muted:        'FF9DB099',
  blue:         'FF1D4ED8',
  amber:        'FFFBBF24',
  amberBg:      'FFFFFBEB',
}

export async function exportDailyHarvestToExcel(
  data: PickerDailyExportRow[],
  dailyColumns: string[],
  dateFrom: string,
  dateTo: string,
) {
  // ─── Column positions ────────────────────────────────────────────
  // 1=# 2=Name 3=ID 4=Phone 5=IBAN 6=Origin 7=kg 8=Salary 9=Boxes 10+=BoxTypes … days
  const KG_COL     = 7
  const SALARY_COL = 8
  const BOXES_COL  = 9
  const PRICE_ROW  = 3
  const HEADER_ROW = 6
  const DATA_START = 7

  const allBoxTypes = Array.from(
    new Set(data.flatMap(p => Object.keys(p.total_box_types)))
  ).sort()

  const FIXED_COLS = 9 + allBoxTypes.length
  const TOTAL_COLS = FIXED_COLS + dailyColumns.length
  const LAST_COL   = col(TOTAL_COLS)

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Mosavali'
  wb.created = new Date()

  // No frozen panes
  const ws = wb.addWorksheet('Daily Harvest')

  // ─── Row 1: Title ────────────────────────────────────────────────
  ws.mergeCells(`A1:${LAST_COL}1`)
  const titleCell = ws.getCell('A1')
  titleCell.value     = `Daily Harvest  ·  ${dateFrom}  →  ${dateTo}`
  titleCell.font      = { name: 'Arial', size: 13, bold: true, color: { argb: G.dark } }
  titleCell.fill      = fill(G.titleBg)
  titleCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  titleCell.border    = { bottom: { style: 'thin', color: { argb: G.border } } }
  ws.getRow(1).height = 30

  // ─── Row 2: Spacer ───────────────────────────────────────────────
  ws.getRow(2).height = 5

  // ─── Row 3: Price input ──────────────────────────────────────────
  ws.mergeCells("A3:B3")
  const priceLabel = ws.getCell("A3")
  priceLabel.value     = 'Price per kg'
  priceLabel.font      = { name: 'Arial', size: 9, bold: true, color: { argb: G.mid } }
  priceLabel.alignment = { horizontal: 'right', vertical: 'middle' }

  const priceVal = ws.getCell('C3')
  priceVal.value     = 1
  priceVal.font      = { name: 'Arial', size: 11, bold: true, color: { argb: G.blue } }
  priceVal.fill      = fill(G.amberBg)
  priceVal.numFmt    = '#,##0.00 "GEL"'
  priceVal.alignment = { horizontal: 'center', vertical: 'middle' }
  priceVal.border    = {
    top: { style: 'thin', color: { argb: G.amber } }, bottom: { style: 'thin', color: { argb: G.amber } },
    left: { style: 'thin', color: { argb: G.amber } }, right: { style: 'thin', color: { argb: G.amber } },
  }

  ws.mergeCells('D3:H3')
  const priceHint = ws.getCell('D3')
  priceHint.value     = '  ← edit to recalculate salaries'
  priceHint.font      = { name: 'Arial', size: 8, italic: true, color: { argb: 'FFCDD8CB' } }
  priceHint.alignment = { horizontal: 'left', vertical: 'middle' }

  ws.getRow(3).height = 22

  // ─── Row 4: Export info ──────────────────────────────────────────
  ws.mergeCells(`A4:${LAST_COL}4`)
  const infoCell = ws.getCell('A4')
  infoCell.value     = `Exported ${new Date().toLocaleString()}  ·  ${data.length} pickers`
  infoCell.font      = { name: 'Arial', size: 8, color: { argb: 'FFCDD8CB' } }
  infoCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  ws.getRow(4).height = 14

  // ─── Row 5: Spacer ───────────────────────────────────────────────
  ws.getRow(5).height = 4

  // ─── Row 6: Column headers ───────────────────────────────────────
  const headerDefs: { label: string; width: number }[] = [
    { label: '#',            width: 4  },
    { label: 'Name',         width: 24 },
    { label: 'ID',           width: 14 },
    { label: 'Phone',        width: 13 },
    { label: 'IBAN',         width: 26 },
    { label: 'Origin',       width: 14 },
    { label: 'Total kg',     width: 11 },
    { label: 'Salary (GEL)', width: 15 },
    { label: 'Total Boxes',  width: 12 },
    ...allBoxTypes.map(bt => ({ label: bt, width: 11 })),
  ]

  const hRow = ws.getRow(HEADER_ROW)
  hRow.height = 22

  headerDefs.forEach(({ label, width }, i) => {
    const c = hRow.getCell(i + 1)
    c.value     = label
    c.font      = { name: 'Arial', size: 9, bold: true, color: { argb: G.white } }
    c.fill      = fill(G.headerFixed)
    c.alignment = { horizontal: i === 1 ? 'left' : 'center', vertical: 'middle', indent: i === 1 ? 1 : 0 }
    c.border    = { right: { style: 'thin', color: { argb: 'FF3D6439' } } }
    ws.getColumn(i + 1).width = width
  })

  // Day column headers — softer green
  dailyColumns.forEach((day, di) => {
    const n = FIXED_COLS + di + 1
    const c = hRow.getCell(n)
    c.value     = format(parseISO(day), 'MMM d')
    c.font      = { name: 'Arial', size: 9, bold: true, color: { argb: G.white } }
    c.fill      = fill(G.headerDay)
    c.alignment = { horizontal: 'center', vertical: 'middle' }
    c.border    = { right: { style: 'thin', color: { argb: 'FF7AAD73' } } }
    ws.getColumn(n).width = 9
  })

  // ─── Data rows ───────────────────────────────────────────────────
  data.forEach((p, idx) => {
    const rowN  = DATA_START + idx
    const isOdd = idx % 2 === 1
    const rowBg = isOdd ? G.rowOdd : G.rowEven
    const r     = ws.getRow(rowN)
    r.height    = 18

    function infoCell(
      colN: number,
      value: ExcelJS.CellValue,
      opts: {
        bold?: boolean; color?: string; numFmt?: string;
        align?: ExcelJS.Alignment['horizontal']; mono?: boolean
      } = {},
    ) {
      const c = r.getCell(colN)
      c.value     = value
      c.fill      = fill(rowBg)
      c.font      = {
        name:  opts.mono ? 'Courier New' : 'Arial',
        size:  10,
        bold:  opts.bold,
        color: { argb: opts.color ?? G.dark },
      }
      c.numFmt    = opts.numFmt ?? ''
      c.alignment = {
        horizontal: opts.align ?? 'left',
        vertical: 'middle',
        indent: !opts.align || opts.align === 'left' ? 1 : 0,
      }
      c.border = {
        bottom: { style: 'thin', color: { argb: G.border } },
        right:  { style: 'thin', color: { argb: G.border } },
      }
    }

    infoCell(1, idx + 1,                          { align: 'center', color: G.muted })
    infoCell(2, `${p.first_name} ${p.last_name}`, { bold: true })
    infoCell(3, p.national_id,                    { mono: true, color: G.mid, align: 'center' })
    infoCell(4, (p as any).phone     ?? '', { color: G.mid, align: 'center' })
    infoCell(5, p.bank_info           ?? '', { mono: true, color: G.mid })
    infoCell(6, p.origin_place ?? '',              { color: G.mid })
    infoCell(7, p.total_kg,                        { bold: true, color: G.kgText, numFmt: '#,##0.0', align: 'right' })

    // Salary — formula
    const sc     = r.getCell(SALARY_COL)
    sc.value     = { formula: `=${col(KG_COL)}${rowN}*$C$${PRICE_ROW}`, result: p.total_kg }
    sc.fill      = fill(rowBg)
    sc.font      = { name: 'Arial', size: 10, bold: true, color: { argb: G.blue } }
    sc.numFmt    = '#,##0.00 "GEL"'
    sc.alignment = { horizontal: 'right', vertical: 'middle' }
    sc.border    = { bottom: { style: 'thin', color: { argb: G.border } }, right: { style: 'thin', color: { argb: G.border } } }

    infoCell(BOXES_COL, p.total_boxes, { align: 'right', numFmt: '#,##0', color: G.mid })

    allBoxTypes.forEach((bt, bti) => {
      infoCell(10 + bti, p.total_box_types[bt] ?? 0, { align: 'right', numFmt: '#,##0', color: G.mid })
    })

    // Day columns — faint green wash
    dailyColumns.forEach((day, di) => {
      const n       = FIXED_COLS + di + 1
      const dayData = p.days[day]
      const hasKg   = dayData && dayData.kg > 0
      const dc      = r.getCell(n)
      dc.value      = hasKg ? dayData.kg : null
      dc.fill       = fill(isOdd ? G.dayColBgOdd : G.dayColBg)   // always tinted regardless of data
      dc.font       = { name: 'Arial', size: 9, color: { argb: hasKg ? G.dayText : G.border } }
      dc.numFmt     = '#,##0.0'
      dc.alignment  = { horizontal: 'center', vertical: 'middle' }
      dc.border     = { bottom: { style: 'thin', color: { argb: G.borderDay } }, right: { style: 'thin', color: { argb: G.borderDay } } }
    })
  })

  // ─── Totals row ──────────────────────────────────────────────────
  const totN = DATA_START + data.length
  ws.getRow(totN).height = 20

  function totCell(
    colN: number,
    value: ExcelJS.CellValue | null,
    opts: { numFmt?: string; formula?: string; highlight?: boolean; dayCol?: boolean } = {},
  ) {
    const c     = ws.getRow(totN).getCell(colN)
    c.value     = opts.formula ? { formula: opts.formula, result: 0 } : (value as ExcelJS.CellValue)
    c.fill      = fill(opts.dayCol ? G.headerDay : G.totalBg)
    c.font      = {
      name: 'Arial', size: 10, bold: true,
      color: { argb: opts.highlight ? G.amber : G.white },
    }
    c.numFmt    = opts.numFmt ?? ''
    c.alignment = { horizontal: colN <= 2 ? 'left' : 'right', vertical: 'middle', indent: colN <= 2 ? 1 : 0 }
    c.border    = { top: { style: 'medium', color: { argb: 'FF2D5229' } } }
  }

  totCell(1, 'TOTAL')
  totCell(2, `${data.length} pickers`)
  for (let i = 3; i <= 6; i++) totCell(i, null)

  totCell(KG_COL, null, {
    numFmt: '#,##0.0',
    formula: `=SUM(${col(KG_COL)}${DATA_START}:${col(KG_COL)}${totN - 1})`,
  })
  totCell(SALARY_COL, null, {
    numFmt: '#,##0.00 "GEL"',
    formula: `=SUM(${col(SALARY_COL)}${DATA_START}:${col(SALARY_COL)}${totN - 1})`,
    highlight: true,
  })
  totCell(BOXES_COL, null, {
    numFmt: '#,##0',
    formula: `=SUM(${col(BOXES_COL)}${DATA_START}:${col(BOXES_COL)}${totN - 1})`,
  })
  allBoxTypes.forEach((_, bti) => {
    const c = 10 + bti
    totCell(c, null, { numFmt: '#,##0', formula: `=SUM(${col(c)}${DATA_START}:${col(c)}${totN - 1})` })
  })
  dailyColumns.forEach((_, di) => {
    const n = FIXED_COLS + di + 1
    totCell(n, null, {
      numFmt: '#,##0.0',
      formula: `=SUM(${col(n)}${DATA_START}:${col(n)}${totN - 1})`,
      dayCol: true,
    })
  })

  // ─── Save ─────────────────────────────────────────────────────────
  const buf = await wb.xlsx.writeBuffer()
  saveAs(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `harvest_${dateFrom}_${dateTo}.xlsx`,
  )
}