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

export const getBoxes  = ()                                  => api.get<Box[]>('/boxes/').then(r => r.data)
export const createBox = (data: BoxCreate)                   => api.post<Box>('/boxes/', data).then(r => r.data)
export const updateBox = (id: number, data: BoxCreate)       => api.put<Box>(`/boxes/${id}`, data).then(r => r.data)
export const deleteBox = (id: number)                        => api.delete(`/boxes/${id}`).then(r => r.data)