import axios from 'axios'

const api = axios.create({ baseURL: 'http://localhost:8000' })

export interface Fruit {
    fruit_id:     number
    fruit_type:   string
    variety_name: string
}

export interface FruitCreate {
    fruit_type:   string
    variety_name: string
}

export const getFruits   = ()                    => api.get<Fruit[]>('/fruits/').then(r => r.data)
export const createFruit = (data: FruitCreate)   => api.post<Fruit>('/fruits/', data).then(r => r.data)