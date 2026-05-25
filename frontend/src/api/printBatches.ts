import axios from 'axios'

const api = axios.create({ baseURL: 'http://localhost:8000' })

export interface PrintBatch {
  batch_id:        number
  picker_id:       number
  fruit_id:        number
  box_number_from: number
  box_number_to:   number
  quantity:        number
  printed_at:      string
}

export interface PrintQueueItem {
  picker_id: number
  fruit_id:  number
  quantity:  number
}

export interface PrintQueueRequest {
  items: PrintQueueItem[]
}

export const createPrintBatch = (data: PrintQueueRequest) =>
  api.post<PrintBatch[]>('/print-batches/queue', data).then(r => r.data)

export const getPrintBatches = () =>
  api.get<PrintBatch[]>('/print-batches/').then(r => r.data)