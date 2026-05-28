import { useEffect } from 'react'
import { CheckCircle, XCircle, X } from 'lucide-react'

export type ToastType = 'success' | 'error'

export interface ToastMessage {
  id:      number
  type:    ToastType
  message: string
}

interface Props {
  toasts:   ToastMessage[]
  onRemove: (id: number) => void
}

export default function Toast({ toasts, onRemove }: Props) {
  return (
    <div className="fixed top-8 right-8 z-50 flex flex-col gap-3">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onRemove }: { toast: ToastMessage, onRemove: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onRemove(toast.id), 6000)
    return () => clearTimeout(timer)
  }, [toast.id])

  const isSuccess = toast.type === 'success'

  return (
    <div className={`flex items-center gap-4 px-5 py-4 rounded-2xl shadow-xl border min-w-96 max-w-md animate-fade-in
      ${isSuccess
        ? 'bg-white border-primary-100'
        : 'bg-white border-red-100'
      }`}
    >
      {isSuccess
        ? <CheckCircle size={28} className="text-primary shrink-0" strokeWidth={2} />
        : <XCircle     size={28} className="text-red-500 shrink-0" strokeWidth={2} />
      }
      <p className="text-base font-semibold text-neutral-800 flex-1">{toast.message}</p>
      <button
        onClick={() => onRemove(toast.id)}
        className="text-neutral-300 hover:text-neutral-500 transition-colors shrink-0 ml-2"
      >
        <X size={18} />
      </button>
    </div>
  )
}