import { useState, useEffect } from 'react'
import { Plus, X, Pencil } from 'lucide-react'
import type { Field, FieldCreate } from '../api/fields'

interface Props {
  open:     boolean
  onClose:  () => void
  onSubmit: (data: FieldCreate) => void
  field:    Field | null
  loading:  boolean
}

export default function FieldDialog({ open, onClose, onSubmit, field, loading }: Props) {
  const [form, setForm]     = useState<FieldCreate>({ field_name: '', description: null })
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (open) {
      setForm(field
        ? { field_name: field.field_name, description: field.description }
        : { field_name: '', description: null }
      )
      setErrors({})
    }
  }, [open, field])

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.field_name.trim()) e.field_name = 'Field name is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = () => {
    if (!validate()) return
    onSubmit({
      field_name:  form.field_name.trim(),
      description: form.description?.trim() || null,
    })
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-8">

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-neutral-800">
              {field ? 'Edit Field' : 'Add New Field'}
            </h2>
            <p className="text-sm text-neutral-400 mt-1">
              {field ? 'Update field details.' : 'Register a new harvest field.'}
            </p>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 transition-colors">
            <X size={22} />
          </button>
        </div>

        <div className="flex flex-col gap-5">

          {/* Field name */}
          <div>
            <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
              Field Name
            </label>
            <input
              className={`mt-1.5 w-full px-4 py-3 rounded-xl bg-neutral-50 border-2 text-sm outline-none focus:border-primary transition-colors
                ${errors.field_name ? 'border-red-400' : 'border-neutral-200'}`}
              placeholder="e.g. North Slope, Valley Block A..."
              value={form.field_name}
              onChange={e => setForm(f => ({ ...f, field_name: e.target.value }))}
            />
            {errors.field_name && <p className="text-xs text-red-500 mt-1">{errors.field_name}</p>}
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">
              Description <span className="text-neutral-300 normal-case font-normal">(optional)</span>
            </label>
            <textarea
              className="mt-1.5 w-full px-4 py-3 rounded-xl bg-neutral-50 border-2 border-neutral-200 text-sm outline-none focus:border-primary transition-colors resize-none"
              placeholder="Notes about this field, location, crop type..."
              rows={3}
              value={form.description ?? ''}
              onChange={e => setForm(f => ({ ...f, description: e.target.value || null }))}
            />
          </div>

        </div>

        {/* Footer */}
        <div className="flex gap-3 mt-8">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border-2 border-neutral-200 text-sm font-semibold text-neutral-600 hover:bg-neutral-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 py-3 rounded-xl bg-primary-700 text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-primary transition-colors disabled:opacity-50"
          >
            {field ? <Pencil size={15} strokeWidth={2.5} /> : <Plus size={15} strokeWidth={2.5} />}
            {loading ? 'Saving...' : field ? 'Save Changes' : 'Add Field'}
          </button>
        </div>

      </div>
    </div>
  )
}