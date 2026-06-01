import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Plus, Pencil, Trash2 } from 'lucide-react'
import { getFields, createField, updateField, deleteField } from '../api/fields'
import type { Field, FieldCreate } from '../api/fields'
import FieldDialog from './FieldDialog'
import ConfirmDialog from './ConfirmDialog'
import Toast from './Toast'
import { useToast } from '../hooks/useToast'
import axios from 'axios'

interface Props {
  open:    boolean
  onClose: () => void
}

export default function FieldManagementDialog({ open, onClose }: Props) {
  const queryClient                       = useQueryClient()
  const { toasts, addToast, removeToast } = useToast()
  const [fieldDialogOpen, setFieldDialogOpen] = useState(false)
  const [editField, setEditField]             = useState<Field | null>(null)
  const [deleteTarget, setDeleteTarget]       = useState<Field | null>(null)

  const { data: fields = [], isLoading } = useQuery({
    queryKey: ['fields'],
    queryFn:  getFields,
    enabled:  open,
  })

  const createMutation = useMutation({
    mutationFn: (data: FieldCreate) => createField(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fields'] })
      addToast('Field added successfully', 'success')
      setFieldDialogOpen(false)
    },
    onError: (error) => {
      if (axios.isAxiosError(error)) {
        addToast(error.response?.data?.detail ?? 'Failed to add field', 'error')
      } else {
        addToast('Failed to add field', 'error')
      }
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: FieldCreate }) => updateField(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fields'] })
      addToast('Field updated', 'success')
      setFieldDialogOpen(false)
      setEditField(null)
    },
    onError: () => addToast('Failed to update field', 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteField(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fields'] })
      addToast('Field deleted', 'success')
    },
    onError: () => addToast('Failed to delete field', 'error'),
  })

  if (!open) return null

  return (
    <>
      {/* Management modal — z-40 so sub-dialogs at z-50 render on top */}
      <div className="fixed inset-0 z-40 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />

        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col overflow-hidden max-h-[80vh]">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b-2 border-neutral-100 shrink-0">
            <div className="flex items-center gap-4">
              <div>
                <h2 className="text-xl font-black text-neutral-900">Fields</h2>
                <p className="text-sm text-neutral-400 mt-0.5">{fields.length} registered</p>
              </div>
              <div className="w-px h-8 bg-neutral-200" />
              <button
                onClick={() => { setEditField(null); setFieldDialogOpen(true) }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-700 text-white text-sm font-semibold hover:bg-primary transition-colors"
              >
                <Plus size={15} strokeWidth={2.5} />
                Add Field
              </button>
            </div>
            <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 transition-colors p-1">
              <X size={22} />
            </button>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-16 text-neutral-400 text-sm">Loading...</div>
            ) : fields.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2">
                <p className="text-neutral-400 text-sm">No fields yet — add your first one.</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-neutral-100 bg-neutral-50">
                    <th className="px-6 py-4 text-left text-xs font-bold text-neutral-500 uppercase tracking-widest">ID</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-neutral-500 uppercase tracking-widest">Name</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-neutral-500 uppercase tracking-widest">Description</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-neutral-500 uppercase tracking-widest">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map(f => (
                    <tr key={f.field_id} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="font-mono text-sm text-neutral-400">
                          F-{String(f.field_id).padStart(3, '0')}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-semibold text-neutral-800">{f.field_name}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-neutral-500">{f.description ?? '—'}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => { setEditField(f); setFieldDialogOpen(true) }}
                            className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition-colors"
                          >
                            <Pencil size={15} strokeWidth={2.5} />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(f)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-neutral-400 hover:text-red-600 transition-colors"
                          >
                            <Trash2 size={15} strokeWidth={2.5} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

        </div>
      </div>

      {/* Sub-dialogs at z-50 — render on top of management modal */}
      <FieldDialog
        open={fieldDialogOpen}
        onClose={() => { setFieldDialogOpen(false); setEditField(null) }}
        onSubmit={data => {
          if (editField) {
            updateMutation.mutate({ id: editField.field_id, data })
          } else {
            createMutation.mutate(data)
          }
        }}
        field={editField}
        loading={createMutation.isPending || updateMutation.isPending}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Field"
        message={
          <>
            Are you sure you want to delete{' '}
            <span className="font-semibold text-neutral-800">{deleteTarget?.field_name}</span>
            ? This cannot be undone.
          </>
        }
        confirmLabel="Delete"
        onConfirm={() => {
          if (!deleteTarget) return
          deleteMutation.mutate(deleteTarget.field_id)
          setDeleteTarget(null)
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      <Toast toasts={toasts} onRemove={removeToast} />
    </>
  )
}