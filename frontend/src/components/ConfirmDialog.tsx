import { AlertTriangle, X } from 'lucide-react'

interface Props {
  open: boolean
  title: string
  message: React.ReactNode
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({ open, title, message, confirmLabel = 'Delete', onConfirm, onCancel }: Props) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />

      {/* Dialog */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-8">

        {/* Close */}
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 text-neutral-300 hover:text-neutral-500 transition-colors"
        >
          <X size={20} />
        </button>

        {/* Icon */}
        <div className="flex justify-center mb-5">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
            <AlertTriangle size={32} className="text-red-500" strokeWidth={2} />
          </div>
        </div>

        {/* Text */}
        <div className="text-center mb-8">
          <h2 className="text-xl font-bold text-neutral-800 mb-2">{title}</h2>
          <p className="text-sm text-neutral-400 leading-relaxed">{message}</p>
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-lg border border-neutral-200 text-sm font-semibold text-neutral-600 hover:bg-neutral-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-lg bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors"
          >
            {confirmLabel}
          </button>
        </div>

      </div>
    </div>
  )
}