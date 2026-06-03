import axios from 'axios'

const api = axios.create({ baseURL: 'http://localhost:8000' })

// ── request / response types ───────────────────────────────────────────

export interface HarvestEntry {
  field_id:          number
  field_name:        number
  picker_id:         number
  box_number:        number
  box_type_id:       number
  harvest_date:      string
  scan_date:         string
  picker_first_name: string
  picker_last_name:  string
  box_name:          string
  box_net_weight_kg: number
}

export interface BarcodeCheckResponse {
  barcode:   string
  valid:     boolean
  reason:    string | null
  scan_date: string | null
}

export interface BulkScanRequest {
  field_id:     number
  box_type_id:  number
  harvest_date: string
  barcodes:     string[]
}

export interface BulkScanResult {
  success:  boolean
  accepted: HarvestEntry[]
  problems: BarcodeCheckResponse[]
}

export interface PaginatedEntries {
  items:     HarvestEntry[]
  total:     number
  page:      number
  page_size: number
  pages:     number
}

// ── stats types ────────────────────────────────────────────────────────

export interface DailyStatEntry {
  harvest_date: string
  box_type_id:  number
  count:        number
}

export interface DailyStatsResponse {
  stats: DailyStatEntry[]
  total: number
}

export interface HarvestOverview {
  total_pickers: number
  total_scanned: number
  total_kg:      number
}

export interface PickerStat {
  picker_id:    number
  first_name:   string
  last_name:    string
  origin_place: string | null
  total_boxes:  number
  total_kg:     number
}

export interface DayBoxBreakdown {
  kg:        number
  box_types: Record<string, {
    count:         number
    net_weight_kg: number
    total_kg:      number
  }>
}

export interface PickerBoxStat {
  picker_id:       number
  first_name:      string
  last_name:       string
  national_id:     string
  phone:           string | null
  bank_info:       string | null
  origin_place:    string | null
  total_kg:        number
  total_boxes:     number
  total_box_types: Record<string, number>
  days:            Record<string, DayBoxBreakdown>
}

export interface FieldStat {
  field_id:    number
  field_name:  string
  description: string | null
  total_boxes: number
  total_kg:    number
}

// ── export types ────────────────────────────────────────────────────────

export interface PickerDetailExportEntry {
  barcode:       string
  box_name:      string
  net_weight_kg: number
  field_name:    string
  harvest_date:  string
}

export interface PickerDetailBoxSummary {
  box_name:      string
  net_weight_kg: number
  count:         number
}

export interface PickerDetailExportRow {
  picker_id:        number
  first_name:       string
  last_name:        string
  national_id:      string
  origin_place:     string | null
  phone:            string
  total_boxes:      number
  total_kg:         number
  box_type_summary: PickerDetailBoxSummary[]
  entries:          PickerDetailExportEntry[]
}

// ── helpers ────────────────────────────────────────────────────────────

function dateParams(from?: string, to?: string): URLSearchParams {
  const p = new URLSearchParams()
  if (from) p.append('from_date', from)
  if (to)   p.append('to_date',   to)
  return p
}

// ── scan endpoints ─────────────────────────────────────────────────────

export const checkBarcode = (barcode: string) =>
  api.post<BarcodeCheckResponse>('/harvest/check', { barcode }).then(r => r.data)

export const bulkScan = (data: BulkScanRequest) =>
  api.post<BulkScanResult>('/harvest/commit', data).then(r => r.data)

// ── entry listing ──────────────────────────────────────────────────────

export const getEntries = (page = 1, pageSize = 25, search = '') => {
  const params = new URLSearchParams()
  params.append('page',      String(page))
  params.append('page_size', String(pageSize))
  if (search) params.append('search', search)
  return api.get<PaginatedEntries>(`/harvest/entries?${params}`).then(r => r.data)
}

// ── stats endpoints ────────────────────────────────────────────────────

export const getHarvestOverview = () =>
  api.get<HarvestOverview>('/harvest/stats/overview').then(r => r.data)

export const getDailyStats = (from?: string, to?: string) =>
  api.get<DailyStatsResponse>(`/harvest/stats/daily?${dateParams(from, to)}`).then(r => r.data)

export const getPickerStats = () =>
  api.get<PickerStat[]>('/harvest/stats/pickers').then(r => r.data)

export const getPickerBoxStats = (from?: string, to?: string) =>
  api.get<PickerBoxStat[]>(`/harvest/stats/pickers/boxes?${dateParams(from, to)}`).then(r => r.data)

export const getFieldStats = (from?: string, to?: string) =>
  api.get<FieldStat[]>(`/harvest/stats/fields?${dateParams(from, to)}`).then(r => r.data)

// ── export endpoints ────────────────────────────────────────────────────

export const getPickerDetailExport = () =>
  api.get<PickerDetailExportRow[]>('/harvest/export/picker-detail').then(r => r.data)