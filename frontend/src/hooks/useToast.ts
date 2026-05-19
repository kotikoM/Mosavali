import { useState, useCallback } from 'react'
import type { ToastMessage, ToastType } from '../components/Toast'
import { useSound } from './useSound'

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const { play } = useSound()

  const addToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, type, message }])
    play(type)
  }, [])

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return { toasts, addToast, removeToast }
}