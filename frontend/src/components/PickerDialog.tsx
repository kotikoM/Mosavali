import { useState, useEffect } from 'react'
import { UserPlus, X } from 'lucide-react'
import type { Picker, PickerCreate, PickerUpdate } from '../api/pickers'

interface Props {
  open:     boolean
  onClose:  () => void
  onSubmit: (data: PickerCreate | PickerUpdate) => void
  picker?:  Picker | null
  loading:  boolean
}

export default function PickerDialog({ open, onClose, onSubmit, picker, loading }: Props) {
  const [form, setForm] = useState({
    national_id:  '',
    first_name:   '',
    last_name:    '',
    origin_place: '',
    bank_info:    '',
    note:         '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const isEdit = !!picker

  useEffect(() => {
    if (picker) {
      setForm({
        national_id:  picker.national_id,
        first_name:   picker.first_name,
        last_name:    picker.last_name,
        origin_place: picker.origin_place ?? '',
        bank_info:    picker.bank_info ?? '',
        note:         picker.note ?? '',
      })
    } else {
      setForm({ national_id: '', first_name: '', last_name: '', origin_place: '', bank_info: '', note: '' })
    }
    setErrors({})
  }, [picker, open])

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.first_name.trim())  e.first_name  = 'First name is required'
    if (!form.last_name.trim())   e.last_name   = 'Last name is required'
    if (!isEdit) {
      if (!form.national_id.trim())               e.national_id = 'National ID is required'
      else if (!/^\d{11}$/.test(form.national_id)) e.national_id = 'Must be exactly 11 numeric digits'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = () => {
    if (!validate()) return
    if (isEdit) {
      const { national_id, ...rest } = form
      onSubmit(rest)
    } else {
      onSubmit(form)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Dialog */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-8">

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-neutral-800">
              {isEdit ? 'Edit Picker' : 'Register New Picker'}
            </h2>
            <p className="text-sm text-neutral-400 mt-1">
              Fill in the official staff credentials to activate scanning access.
            </p>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 transition-colors">
            <X size={22} />
          </button>
        </div>

        {/* Form */}
        <div className="flex flex-col gap-5">

          {/* First + Last name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">First Name</label>
              <input
                className={`mt-1 w-full px-4 py-2.5 rounded-lg bg-neutral-50 border text-sm outline-none focus:border-primary transition-colors ${errors.first_name ? 'border-red-400' : 'border-neutral-200'}`}
                placeholder="e.g. John"
                value={form.first_name}
                onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
              />
              {errors.first_name && <p className="text-xs text-red-500 mt-1">{errors.first_name}</p>}
            </div>
            <div>
              <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Last Name</label>
              <input
                className={`mt-1 w-full px-4 py-2.5 rounded-lg bg-neutral-50 border text-sm outline-none focus:border-primary transition-colors ${errors.last_name ? 'border-red-400' : 'border-neutral-200'}`}
                placeholder="e.g. Smith"
                value={form.last_name}
                onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
              />
              {errors.last_name && <p className="text-xs text-red-500 mt-1">{errors.last_name}</p>}
            </div>
          </div>

          {/* National ID + Origin */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">National ID</label>
              <input
                className={`mt-1 w-full px-4 py-2.5 rounded-lg bg-neutral-50 border text-sm outline-none focus:border-primary transition-colors ${errors.national_id ? 'border-red-400' : 'border-neutral-200'} ${isEdit ? 'opacity-50 cursor-not-allowed' : ''}`}
                placeholder="00000000000"
                value={form.national_id}
                onChange={e => setForm(f => ({ ...f, national_id: e.target.value }))}
                disabled={isEdit}
              />
              {errors.national_id && <p className="text-xs text-red-500 mt-1">{errors.national_id}</p>}
            </div>
            <div>
              <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Origin Place</label>
              <input
                className="mt-1 w-full px-4 py-2.5 rounded-lg bg-neutral-50 border border-neutral-200 text-sm outline-none focus:border-primary transition-colors"
                placeholder="e.g. Tbilisi"
                value={form.origin_place}
                onChange={e => setForm(f => ({ ...f, origin_place: e.target.value }))}
              />
            </div>
          </div>

          {/* Bank info */}
          <div>
            <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Bank Information</label>
            <input
              className="mt-1 w-full px-4 py-2.5 rounded-lg bg-neutral-50 border border-neutral-200 text-sm outline-none focus:border-primary transition-colors"
              placeholder="Branch / Account Number / Key / IBAN"
              value={form.bank_info}
              onChange={e => setForm(f => ({ ...f, bank_info: e.target.value }))}
            />
          </div>

          {/* Note */}
          <div>
            <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Internal Note</label>
            <textarea
              className="mt-1 w-full px-4 py-2.5 rounded-lg bg-neutral-50 border border-neutral-200 text-sm outline-none focus:border-primary transition-colors resize-none"
              placeholder="Contract specifics or performance history notes..."
              rows={3}
              value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
            />
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
            className="flex-1 py-2.5 rounded-lg bg-primary-600 text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-primary-500 transition-colors disabled:opacity-50"
          >
            <UserPlus size={16} />
            {isEdit ? 'Save Changes' : 'Register Staff Member'}
          </button>
        </div>

      </div>
    </div>
  )
}