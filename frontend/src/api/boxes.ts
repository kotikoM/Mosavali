import axios from 'axios'

const api = axios.create({ baseURL: 'http://localhost:8000' })

export interface Box {
  box_id: number
  name: string
  empty_weight_kg: string
  full_weight_kg: string
  net_weight_kg: string
  description: string | null
}

export interface BoxCreate {
  name: string
  empty_weight_kg: string
  full_weight_kg: string
  description?: string
}

export const getBoxes  = ()                  => api.get<Box[]>('/boxes/').then(r => r.data)
export const createBox = (data: BoxCreate)   => api.post<Box>('/boxes/', data).then(r => r.data)