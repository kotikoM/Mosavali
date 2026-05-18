import axios from 'axios'

const api = axios.create({ baseURL: 'http://localhost:8000' })

export interface Picker {
    picker_id:    number
    national_id:  string
    first_name:   string
    last_name:    string
    origin_place: string | null
    bank_info:    string | null
    note:         string | null
}

export interface PickerCreate {
    national_id:   string
    first_name:    string
    last_name:     string
    origin_place?: string
    bank_info?:    string
    note?:         string
}

export interface PickerUpdate {
    first_name?:   string
    last_name?:    string
    origin_place?: string
    bank_info?:    string
    note?:         string
}


export const getPickers     = ()                               => api.get<Picker[]>('/pickers/').then(r => r.data)
export const createPicker   = (data: PickerCreate)             => api.post<Picker>('/pickers/', data).then(r => r.data)
export const updatePicker   = (id: number, data: PickerUpdate) => api.put<Picker>(`/pickers/${id}`, data).then(r => r.data)
export const deletePicker   = (id: number)                     => api.delete(`/pickers/${id}`).then(r => r.data)