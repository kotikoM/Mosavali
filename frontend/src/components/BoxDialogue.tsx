import { useEffect, useMemo, useState } from 'react'
import { Package2, X } from 'lucide-react'
import type { BoxCreate } from '../api/boxes'

interface Props {
  open:     boolean
  onClose:  () => void
  onSubmit: (data: BoxCreate) => void
  loading:  boolean
}

export default function BoxDialog({ open, onClose, onSubmit, loading }: Props) {
  const [form, setForm] = useState({
    name:            '',
    empty_weight_kg: '',
    full_weight_kg:  '',
    description:     '',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setForm({ name: '', empty_weight_kg: '', full_weight_kg: '', description: '' })
    setErrors({})
  }, [open])

  const netWeight = useMemo(() => {
    const empty = parseFloat(form.empty_weight_kg)
    const full  = parseFloat(form.full_weight_kg)
    if (isNaN(empty) || isNaN(full)) return null
    return full - empty
  }, [form.empty_weight_kg, form.full_weight_kg])

  const fullWeightBelowEmpty = useMemo(() => {
    const empty = parseFloat(form.empty_weight_kg)
    const full  = parseFloat(form.full_weight_kg)
    if (!form.full_weight_kg || isNaN(empty) || isNaN(full)) return false
    return full <= empty
  }, [form.empty_weight_kg, form.full_weight_kg])

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.name.trim())            e.name            = 'Box name is required'
    if (!form.empty_weight_kg.trim()) e.empty_weight_kg = 'Empty weight is required'
    if (!form.full_weight_kg.trim())  e.full_weight_kg  = 'Full weight is required'
    if (fullWeightBelowEmpty)         e.full_weight_kg  = 'Full weight must exceed empty weight'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = () => {
    if (!validate()) return
    onSubmit({
      name:            form.name,
      empty_weight_kg: Number(form.empty_weight_kg).toFixed(3),
      full_weight_kg:  Number(form.full_weight_kg).toFixed(3),
      description:     form.description || undefined,
    })
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />

      <div className="relative w-full max-w-3xl rounded-[2rem] bg-white shadow-2xl overflow-hidden">
        <div className="flex min-h-0">

          {/* Left — form */}
          <div className="flex-1 p-10 overflow-y-auto">

            {/* Header */}
            <div className="flex items-start justify-between mb-8">
              <div>
                <h2 className="text-2xl font-black tracking-tight text-neutral-900">Register Box Type</h2>
                <p className="mt-1 text-sm text-neutral-500">Define a new container weight profile.</p>
              </div>
              <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 transition-colors mt-1">
                <X size={22} />
              </button>
            </div>

            {/* Form */}
            <div className="flex flex-col gap-5">

              {/* Name */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-neutral-500">Box Name</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Extra Large Harvest Crate"
                  className={`mt-2 w-full rounded-xl border bg-neutral-50 px-4 py-3 text-sm outline-none transition-colors focus:border-primary
                    ${errors.name ? 'border-red-400' : 'border-neutral-200'}`}
                />
                {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
              </div>

              {/* Weights */}
              <div className="grid grid-cols-2 gap-4">

                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-neutral-500">Empty Weight (kg)</label>
                  <div className="relative mt-2">
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={form.empty_weight_kg}
                      onChange={e => setForm(f => ({ ...f, empty_weight_kg: e.target.value }))}
                      className={`w-full rounded-xl border bg-neutral-50 px-4 py-3 pr-12 text-sm outline-none transition-colors focus:border-primary
                        ${errors.empty_weight_kg ? 'border-red-400' : 'border-neutral-200'}`}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-neutral-400">KG</span>
                  </div>
                  {errors.empty_weight_kg && <p className="mt-1 text-xs text-red-500">{errors.empty_weight_kg}</p>}
                </div>

                <div>
                  <label className="text-xs font-bold uppercase tracking-wide text-neutral-500">Full Weight (kg)</label>
                  <div className="relative mt-2">
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={form.full_weight_kg}
                      onChange={e => setForm(f => ({ ...f, full_weight_kg: e.target.value }))}
                      className={`w-full rounded-xl border bg-neutral-50 px-4 py-3 pr-12 text-sm outline-none transition-colors focus:border-primary
                        ${errors.full_weight_kg || fullWeightBelowEmpty ? 'border-red-400' : 'border-neutral-200'}`}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-neutral-400">KG</span>
                  </div>
                  {fullWeightBelowEmpty && !errors.full_weight_kg && (
                    <p className="mt-1 text-xs text-red-500">Full weight must exceed empty weight</p>
                  )}
                  {errors.full_weight_kg && <p className="mt-1 text-xs text-red-500">{errors.full_weight_kg}</p>}
                </div>

              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-neutral-500">Description</label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Industrial grade vented crate for soft fruit varieties."
                  className="mt-2 w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none transition-colors focus:border-primary"
                />
              </div>

            </div>

            {/* Footer */}
            <div className="mt-8 flex gap-4">
              <button
                onClick={onClose}
                className="flex-1 rounded-xl border border-neutral-200 py-3 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading || fullWeightBelowEmpty}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary-700 py-3 text-sm font-semibold text-white hover:bg-primary transition-colors disabled:opacity-50"
              >
                <Package2 size={17} />
                Save Configuration
              </button>
            </div>

          </div>

          {/* Right panel */}
{/* Right panel */}
<div className="w-80 shrink-0 bg-neutral-100 flex items-center justify-center p-8">
  <div className="w-full max-w-[260px] rounded-3xl bg-white p-6 shadow-[0_20px_50px_rgba(0,0,0,0.12)] border border-neutral-100">

    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 text-center">
      Live Calculation
    </p>

    <div className="mt-5 flex flex-col items-center justify-center">
      <p className="text-sm text-neutral-500">Net Weight</p>

      <div className="mt-3 w-full text-center">
        <span
          className={`
            block w-full overflow-hidden text-ellipsis break-words
            text-4xl leading-none font-black tracking-tight
            ${netWeight === null
              ? 'text-neutral-300'
              : netWeight <= 0
                ? 'text-red-500'
                : 'text-primary-900'}
          `}
        >
          {netWeight === null ? '—' : netWeight.toFixed(3)}
        </span>

        {netWeight !== null && (
          <span className="mt-2 block text-sm font-semibold text-neutral-400">
            kg
          </span>
        )}
      </div>

      {netWeight !== null && netWeight <= 0 && (
        <p className="mt-3 text-center text-xs font-medium text-red-500">
          Invalid weight range
        </p>
      )}
    </div>
  </div>
</div>

        </div>
      </div>
    </div>
  )
}