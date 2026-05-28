import axios from 'axios'

const api = axios.create({ baseURL: 'http://localhost:8000' })

export interface HarvestEntry {
  field_id:     number
  picker_id:    number
  box_number:   number
  box_type_id:  number
  harvest_date: string
  scan_date:    string
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

export const checkBarcode       = (barcode: string)            => api.post<BarcodeCheckResponse>('/harvest/check', { barcode }).then(r => r.data)
export const bulkScan           = (data: BulkScanRequest)      => api.post<BulkScanResult>('/harvest/scan', data).then(r => r.data)
export const getEntries         = ()                           => api.get<HarvestEntry[]>('/harvest/').then(r => r.data)
export const getHarvestOverview = ()                           => api.get<HarvestOverview>('/harvest/overview').then(r => r.data)
export const getPickerStats     = ()                           => api.get<PickerStat[]>('/harvest/picker-stats').then(r => r.data)
export const getDailyStats      = (from?: string, to?: string) => {
  const params = new URLSearchParams()
  if (from) params.append('from_date', from)
  if (to)   params.append('to_date', to)
  return api.get<DailyStatsResponse>(`/harvest/stats?${params}`).then(r => r.data)
}