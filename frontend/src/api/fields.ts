import axios from 'axios'

const api = axios.create({ baseURL: 'http://localhost:8000' })

export interface Field {
  field_id:    number
  field_name:  string
  description: string | null
}

export interface FieldCreate {
  field_name:  string
  description: string | null
}

export const getFields    = ()                    => api.get<Field[]>('/fields/').then(r => r.data)
export const createField  = (data: FieldCreate)   => api.post<Field>('/fields/', data).then(r => r.data)
export const updateField  = (id: number, data: FieldCreate) => api.put<Field>(`/fields/${id}`, data).then(r => r.data)
export const deleteField  = (id: number)          => api.delete(`/fields/${id}`)