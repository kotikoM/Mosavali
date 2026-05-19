import { useState, useEffect } from 'react'
import { Plus, X, Check } from 'lucide-react'
import { FRUIT_TYPES } from '../utils/fruitStyles'
import type { FruitCreate } from '../api/fruits'

interface Props {
  open:     boolean
  onClose:  () => void
  onSubmit: (data: FruitCreate) => void
  loading:  boolean
}

export default function FruitDialog({ open, onClose, onSubmit, loading }: Props) {
  const [form, setForm]     = useState({ fruit_type: '', variety_name: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (open) {
      setForm({ fruit_type: '', variety_name: '' })
      setErrors({})
    }
  }, [open])

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.fruit_type)          e.fruit_type   = 'Please select a fruit type'
    if (!form.variety_name.trim()) e.variety_name = 'Variety name is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = () => {
    if (!validate()) return
    onSubmit({ fruit_type: form.fruit_type.toLowerCase(), variety_name: form.variety_name.trim() })
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-8">

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-neutral-800">Add New Fruit</h2>
            <p className="text-sm text-neutral-400 mt-1">Register a new fruit variety to the catalogue.</p>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 transition-colors">
            <X size={22} />
          </button>
        </div>

        <div className="flex flex-col gap-6">

          {/* Fruit type grid */}
          <div>
            <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
              Fruit Type
            </label>
            {errors.fruit_type && <p className="text-xs text-red-500 mt-1">{errors.fruit_type}</p>}
            <div className="mt-2 grid grid-cols-4 gap-2">
              {FRUIT_TYPES.map(type => {
                const isSelected = form.fruit_type === type
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, fruit_type: type }))}
                    className={`relative px-3 py-2.5 rounded-xl text-sm font-medium border transition-all text-mid
                      ${isSelected
                        ? 'bg-primary-700 border-primary-700 text-white'
                        : 'bg-neutral-50 border-neutral-200 text-neutral-600 hover:border-primary hover:bg-primary-50 hover:text-primary-700'
                      }`}
                  >
                    {isSelected && (
                      <span className="absolute top-1.5 right-1.5">
                        <Check size={10} strokeWidth={3} />
                      </span>
                    )}
                    {type}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Variety name */}
          <div>
            <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
              Variety Name
            </label>
            <input
              className={`mt-1 w-full px-4 py-2.5 rounded-lg bg-neutral-50 border text-sm outline-none focus:border-primary transition-colors
                ${errors.variety_name ? 'border-red-400' : 'border-neutral-200'}`}
              placeholder="e.g. Alex Blue, Granny Smith, Montmorency..."
              value={form.variety_name}
              onChange={e => setForm(f => ({ ...f, variety_name: e.target.value }))}
            />
            {errors.variety_name && <p className="text-xs text-red-500 mt-1">{errors.variety_name}</p>}
          </div>

        </div>

        {/* Footer */}
        <div className="flex gap-3 mt-8">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-neutral-200 text-sm font-semibold text-neutral-600 hover:bg-neutral-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 py-2.5 rounded-lg bg-primary-600 text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-primary transition-colors disabled:opacity-50"
          >
            <Plus size={16} strokeWidth={2.5} />
            {loading ? 'Adding...' : 'Add Fruit'}
          </button>
        </div>

      </div>
    </div>
  )
}