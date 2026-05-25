import axios from 'axios'

const api = axios.create({ baseURL: 'http://localhost:8000' })

export interface HarvestEntry {
  fruit_id:     number
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
  box_type_id:  number
  harvest_date: string
  barcodes:     string[]
}

export interface BulkScanResult {
  success:  boolean
  accepted: HarvestEntry[]
  problems: BarcodeCheckResponse[]
}

export const checkBarcode  = (barcode: string)       => api.post<BarcodeCheckResponse>('/harvest/check', { barcode }).then(r => r.data)
export const bulkScan      = (data: BulkScanRequest) => api.post<BulkScanResult>('/harvest/scan', data).then(r => r.data)
export const getEntries    = ()                       => api.get<HarvestEntry[]>('/harvest/').then(r => r.data)