import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import type { PickerDetailExportRow } from '../api/harvest'

// ── helpers ───────────────────────────────────────────────────────────

function col(n: number): string {
  let s = ''
  while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) }
  return s
}

const fill = (argb: string): ExcelJS.Fill =>
  ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })

// ── palette ───────────────────────────────────────────────────────────

const G = {
  headerBg:     'FF4A7C45',
  titleBg:      'FFF2F8F1',
  border:       'FFD9EAD7',
  headerBorder: 'FF3D6439',

  groupBg:      'FFD6E8D3',   // group header row background
  groupText:    'FF2D5A27',   // group header text
  groupBorder:  'FF7DB57A',   // group header bottom border

  summaryBg:    'FFD0E8CB',
  summaryTop:   'FFB0D4A8',

  entryOdd:     'FFF7FAF6',
  entryEven:    'FFFFFFFF',
  entryBorder:  'FFEEEEEE',

  black:        'FF000000',
  white:        'FFFFFFFF',
  green:        'FF2D5A27',
  indentGreen:  'FF8CB885',
}

// ── border helpers ────────────────────────────────────────────────────

const summaryBorder = (pos: 'top' | 'mid'): Partial<ExcelJS.Borders> => ({
  top:    { style: pos === 'top' ? 'medium' : 'thin', color: { argb: G.summaryTop } },
  bottom: { style: 'thin',   color: { argb: G.summaryTop } },
  right:  { style: 'thin',   color: { argb: G.border } },
})

const entryBorderStyle: Partial<ExcelJS.Borders> = {
  bottom: { style: 'thin', color: { argb: G.entryBorder } },
  right:  { style: 'thin', color: { argb: G.entryBorder } },
}

// ── main export ───────────────────────────────────────────────────────

export async function exportPickerDetailToExcel(data: PickerDetailExportRow[]) {

  // ── Collect all box types globally ───────────────────────────────
  const allBoxTypes = Array.from(
    new Set(data.flatMap(p => p.box_type_summary.map(b => b.box_name)))
  ).sort()

  const boxNetWeights: Record<string, number> = {}
  for (const picker of data) {
    for (const b of picker.box_type_summary) {
      if (!(b.box_name in boxNetWeights)) boxNetWeights[b.box_name] = b.net_weight_kg
    }
  }

  // ── Column layout ─────────────────────────────────────────────────
  // 1=Marker  2=Name  3=NationalID  4=Origin  5=Phone
  // 6=TotalBoxes  7…(6+N)=BoxTypes  (7+N)=TotalKG
  const BOX_START    = 7
  const TOTAL_KG_COL = BOX_START + allBoxTypes.length
  const TOTAL_COLS   = TOTAL_KG_COL
  const LAST_COL     = col(TOTAL_COLS)

  // ── Row positions ─────────────────────────────────────────────────
  const TITLE_ROW  = 1
  const INFO_ROW   = 2
  // row 3: spacer
  const GROUP_ROW  = 4   // ← new group header row
  const HEADER_ROW = 5
  const DATA_START = 6

  const totalBoxesAll = data.reduce((s, p) => s + p.total_boxes, 0)
  const totalKgAll    = data.reduce((s, p) => s + p.total_kg,    0)

  // ── Workbook ──────────────────────────────────────────────────────
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Mosavali'
  wb.created = new Date()
  const ws  = wb.addWorksheet('All Stickers')

  // ── Row 1: Title ──────────────────────────────────────────────────
  ws.mergeCells(`A1:${LAST_COL}1`)
  const t     = ws.getCell('A1')
  t.value     = 'Picker Harvest Detail — All Entries'
  t.font      = { name: 'Arial', size: 13, bold: true, color: { argb: G.black } }
  t.fill      = fill(G.titleBg)
  t.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  t.border    = { bottom: { style: 'thin', color: { argb: G.border } } }
  ws.getRow(TITLE_ROW).height = 30

  // ── Row 2: Summary stats ──────────────────────────────────────────
  ws.mergeCells(`A2:${LAST_COL}2`)
  const info     = ws.getCell('A2')
  info.value     = `Exported ${new Date().toLocaleString()}  ·  ${data.length} pickers  ·  ${totalBoxesAll.toLocaleString()} boxes  ·  ${totalKgAll.toLocaleString()} kg total`
  info.font      = { name: 'Arial', size: 8, color: { argb: 'FFAAAAAA' } }
  info.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  ws.getRow(INFO_ROW).height = 14

  // ── Row 3: Spacer ─────────────────────────────────────────────────
  ws.getRow(3).height = 5

  // ── Row 4: Group headers ──────────────────────────────────────────
  //   Col A           : (blank marker)
  //   Cols B–E        : PICKER
  //   Cols F–(KG-1)   : BOX COUNTS
  //   Col KG          : TOTAL KG
  ws.getRow(GROUP_ROW).height = 16

  // paint entire row with group bg first
  for (let c = 1; c <= TOTAL_COLS; c++) {
    const cell  = ws.getRow(GROUP_ROW).getCell(c)
    cell.fill   = fill(G.groupBg)
    cell.border = { bottom: { style: 'medium', color: { argb: G.groupBorder } } }
  }

  function groupCell(
    startCol: number,
    endCol:   number,
    label:    string,
  ) {
    if (startCol < endCol) {
      ws.mergeCells(`${col(startCol)}${GROUP_ROW}:${col(endCol)}${GROUP_ROW}`)
    }
    const c     = ws.getRow(GROUP_ROW).getCell(startCol)
    c.value     = label
    c.fill      = fill(G.groupBg)
    c.font      = { name: 'Arial', size: 7, bold: true, color: { argb: G.groupText } }
    c.alignment = { horizontal: 'center', vertical: 'middle' }
    c.border    = {
      left:   { style: 'thin',   color: { argb: G.groupBorder } },
      bottom: { style: 'medium', color: { argb: G.groupBorder } },
    }
  }

  // Col 1: marker (blank, no label)
  groupCell(1, 1, '')

  // Cols 2–5: PICKER
  groupCell(2, 5, 'PICKER')

  // Cols 6–(TOTAL_KG_COL−1): BOX COUNTS
  const countsEnd = TOTAL_KG_COL - 1
  groupCell(6, countsEnd, 'BOX COUNTS')

  // Last col: TOTAL KG
  groupCell(TOTAL_KG_COL, TOTAL_KG_COL, 'TOTAL KG')

  // ── Row 5: Column headers ─────────────────────────────────────────
  const boxColWidth = (bt: string): number => {
    const label = `${bt} (${boxNetWeights[bt] ?? '?'}kg)`
    return Math.max(12, label.length + 3)   // +3 for cell padding
  }

  const headerDefs: { label: string; width: number }[] = [
    { label: '',             width: 4  },
    { label: 'Name',         width: 24 },
    { label: 'National ID',  width: 15 },
    { label: 'Origin',       width: 14 },
    { label: 'Phone',        width: 14 },
    { label: 'Total Boxes',  width: 13 },
    ...allBoxTypes.map(bt => ({
      label: `${bt} (${boxNetWeights[bt] ?? '?'}kg)`,
      width: boxColWidth(bt),
    })),
    { label: 'Total KG',     width: 12 },
  ]

  const hRow   = ws.getRow(HEADER_ROW)
  hRow.height  = 20
  headerDefs.forEach(({ label, width }, i) => {
    const c     = hRow.getCell(i + 1)
    c.value     = label
    c.font      = { name: 'Arial', size: 9, bold: true, color: { argb: G.white } }
    c.fill      = fill(G.headerBg)
    c.alignment = {
      horizontal: i <= 1 ? 'left' : 'center',
      vertical:   'middle',
      indent:     i <= 1 ? 1 : 0,
    }
    c.border = {
      right:  { style: 'thin',   color: { argb: G.headerBorder } },
      bottom: { style: 'medium', color: { argb: G.headerBorder } },
    }
    ws.getColumn(i + 1).width = width
  })

  // ── Data ──────────────────────────────────────────────────────────
  let rowN = DATA_START

  data.forEach((picker, pickerIdx) => {
    const boxCounts: Record<string, number> = {}
    for (const b of picker.box_type_summary) boxCounts[b.box_name] = b.count

    // ── Summary row ───────────────────────────────────────────────
    const sr  = ws.getRow(rowN)
    sr.height = 21

    function sumCell(
      colN:  number,
      value: ExcelJS.CellValue,
      opts: {
        bold?:   boolean
        align?:  ExcelJS.Alignment['horizontal']
        mono?:   boolean
        color?:  string
        numFmt?: string
      } = {},
    ) {
      const c     = sr.getCell(colN)
      c.value     = value
      c.fill      = fill(G.summaryBg)
      c.font      = {
        name:  opts.mono ? 'Courier New' : 'Arial',
        size:  10,
        bold:  opts.bold ?? false,
        color: { argb: opts.color ?? G.black },
      }
      c.numFmt    = opts.numFmt ?? ''
      c.alignment = {
        horizontal: opts.align ?? 'left',
        vertical:   'middle',
        indent:     (!opts.align || opts.align === 'left') ? 1 : 0,
      }
      c.border = summaryBorder('top')
    }

    sumCell(1, pickerIdx + 1,                              { bold: true, align: 'center', color: G.green })
    sumCell(2, `${picker.last_name} ${picker.first_name}`, { bold: true })
    sumCell(3, picker.national_id,                         { mono: true, align: 'center' })
    sumCell(4, picker.origin_place ?? '—')
    sumCell(5, picker.phone,                               { mono: true, align: 'center' })
    sumCell(6, picker.total_boxes,                         { bold: true, align: 'right', numFmt: '#,##0' })

    allBoxTypes.forEach((bt, bti) => {
      sumCell(BOX_START + bti, boxCounts[bt] ?? 0, { align: 'right', numFmt: '#,##0' })
    })

    sumCell(TOTAL_KG_COL, picker.total_kg, {
      bold:   true,
      align:  'right',
      numFmt: '#,##0.0',
      color:  G.green,
    })

    rowN++

    // ── Entry rows ────────────────────────────────────────────────
    picker.entries.forEach((entry, ei) => {
      const er  = ws.getRow(rowN)
      er.height = 15
      const bg  = ei % 2 === 0 ? G.entryOdd : G.entryEven

      for (let c = 1; c <= TOTAL_COLS; c++) {
        const cell  = er.getCell(c)
        cell.fill   = fill(bg)
        cell.border = entryBorderStyle
      }

      function entryCell(
        colN:  number,
        value: ExcelJS.CellValue,
        opts: {
          bold?:  boolean
          align?: ExcelJS.Alignment['horizontal']
          mono?:  boolean
          color?: string
        } = {},
      ) {
        const c     = er.getCell(colN)
        c.value     = value
        c.fill      = fill(bg)
        c.font      = {
          name:  opts.mono ? 'Courier New' : 'Arial',
          size:  9,
          bold:  opts.bold ?? false,
          color: { argb: opts.color ?? G.black },
        }
        c.alignment = {
          horizontal: opts.align ?? 'left',
          vertical:   'middle',
          indent:     (!opts.align || opts.align === 'left') ? 2 : 0,
        }
        c.border = entryBorderStyle
      }

      entryCell(1, '↳',                                             { align: 'center', color: G.indentGreen })
      entryCell(2, entry.barcode,                                   { mono: true, bold: true })
      entryCell(3, `${entry.box_name} (${entry.net_weight_kg}kg)`,  {})
      entryCell(4, entry.field_name,                                {})
      entryCell(5, entry.harvest_date,                              { mono: true, align: 'center' })

      rowN++
    })
  })

  // ── Grand total row ───────────────────────────────────────────────
  const gtr  = ws.getRow(rowN)
  gtr.height = 22

  function grandCell(
    colN:  number,
    value: ExcelJS.CellValue,
    opts: { numFmt?: string; highlight?: boolean } = {},
  ) {
    const c     = gtr.getCell(colN)
    c.value     = value
    c.fill      = fill(G.headerBg)
    c.font      = {
      name:  'Arial',
      size:  10,
      bold:  true,
      color: { argb: opts.highlight ? 'FFFBBF24' : G.white },
    }
    c.numFmt    = opts.numFmt ?? ''
    c.alignment = { horizontal: colN <= 2 ? 'left' : 'right', vertical: 'middle', indent: colN <= 2 ? 1 : 0 }
    c.border    = { top: { style: 'medium', color: { argb: G.headerBorder } } }
  }

  grandCell(1, 'TOTAL')
  grandCell(2, `${data.length} pickers`)
  for (let c = 3; c <= 5; c++) grandCell(c, null)
  grandCell(6, totalBoxesAll, { numFmt: '#,##0' })

  allBoxTypes.forEach((bt, bti) => {
    const count = data.reduce((s, p) => {
      const b = p.box_type_summary.find(x => x.box_name === bt)
      return s + (b?.count ?? 0)
    }, 0)
    grandCell(BOX_START + bti, count, { numFmt: '#,##0' })
  })

  grandCell(TOTAL_KG_COL, Math.round(totalKgAll * 10) / 10, {
    numFmt:    '#,##0.0',
    highlight: true,
  })

  // ── Save ──────────────────────────────────────────────────────────
  const buf = await wb.xlsx.writeBuffer()
  saveAs(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `all_stickers_${new Date().toISOString().slice(0, 10)}.xlsx`,
  )
}