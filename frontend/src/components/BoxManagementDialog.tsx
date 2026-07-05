import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Plus, Pencil, Trash2 } from 'lucide-react'
import { getBoxes, createBox, updateBox, deleteBox } from '../api/boxes'
import type { Box, BoxCreate } from '../api/boxes'
import BoxDialog from './BoxDialogue'
import ConfirmDialog from './ConfirmDialog'
import Toast from './Toast'
import { useToast } from '../hooks/useToast'
import axios from 'axios'

interface Props {
  open:    boolean
  onClose: () => void
}

export default function BoxManagementDialog({ open, onClose }: Props) {
  const queryClient                       = useQueryClient()
  const { toasts, addToast, removeToast } = useToast()
  const [boxDialogOpen, setBoxDialogOpen] = useState(false)
  const [editBox, setEditBox]             = useState<Box | null>(null)
  const [deleteTarget, setDeleteTarget]   = useState<Box | null>(null)

  const { data: boxes = [], isLoading } = useQuery({
    queryKey: ['boxes'],
    queryFn:  getBoxes,
    enabled:  open,
  })

  const createMutation = useMutation({
    mutationFn: (data: BoxCreate) => createBox(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['boxes'] })
      addToast(`"${variables.name}" added to box types`, 'success')
      setBoxDialogOpen(false)
    },
    onError: (error) => {
      if (axios.isAxiosError(error) && error.response?.data?.detail) {
        addToast(error.response.data.detail, 'error')
      } else {
        addToast('Failed to create box type', 'error')
      }
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: BoxCreate }) => updateBox(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['boxes'] })
      addToast(`"${variables.data.name}" updated`, 'success')
      setBoxDialogOpen(false)
      setEditBox(null)
    },
    onError: (error) => {
      if (axios.isAxiosError(error) && error.response?.data?.detail) {
        addToast(error.response.data.detail, 'error')
      } else {
        addToast('Failed to update box type', 'error')
      }
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteBox(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['boxes'] })
      const name = boxes.find(b => b.box_id === id)?.name
      addToast(name ? `"${name}" deleted` : 'Box type deleted', 'success')
    },
    onError: (error) => {
      if (axios.isAxiosError(error) && error.response?.data?.detail) {
        addToast(error.response.data.detail, 'error')
      } else {
        addToast('Failed to delete box type', 'error')
      }
    },
  })

  if (!open) return null

  return (
    <>
      {/* Management modal — z-40 so sub-dialogs at z-50 render on top */}
      <div className="fixed inset-0 z-40 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />

        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl mx-4 flex flex-col overflow-hidden max-h-[80vh]">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b-2 border-neutral-100 shrink-0">
            <div className="flex items-center gap-4">
              <div>
                <h2 className="text-xl font-black text-neutral-900">Box Types</h2>
                <p className="text-sm text-neutral-400 mt-0.5">{boxes.length} registered</p>
              </div>
              <div className="w-px h-8 bg-neutral-200" />
              <button
                onClick={() => { setEditBox(null); setBoxDialogOpen(true) }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-700 text-white text-sm font-semibold hover:bg-primary transition-colors"
              >
                <Plus size={15} strokeWidth={2.5} />
                Add Box Type
              </button>
            </div>
            <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 transition-colors p-1">
              <X size={22} />
            </button>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-y-auto overflow-x-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-16 text-neutral-400 text-sm">Loading...</div>
            ) : boxes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2">
                <p className="text-neutral-400 text-sm">No box types yet — add your first one.</p>
              </div>
            ) : (
              <table className="w-full min-w-[860px]">
                <thead>
                  <tr className="border-b-2 border-neutral-100 bg-neutral-50">
                    <th className="px-6 py-4 text-left text-xs font-bold text-neutral-500 uppercase tracking-widest">ID</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-neutral-500 uppercase tracking-widest">Name</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-neutral-500 uppercase tracking-widest">Empty</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-neutral-500 uppercase tracking-widest">Full</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-neutral-500 uppercase tracking-widest">Net</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-neutral-500 uppercase tracking-widest">Description</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-neutral-500 uppercase tracking-widest">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {boxes.map(b => (
                    <tr key={b.box_id} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                      <td className="px-6 py-4">
                        <span className="font-mono text-sm text-neutral-400">
                          B-{String(b.box_id).padStart(3, '0')}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-semibold text-neutral-800">{b.name}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-sm text-neutral-600">{Number(b.empty_weight_kg).toFixed(3)} kg</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-sm text-neutral-600">{Number(b.full_weight_kg).toFixed(3)} kg</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-sm font-bold text-primary-700 bg-primary-50 px-2.5 py-1 rounded-lg">
                          {Number(b.net_weight_kg).toFixed(3)} kg
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-neutral-500">{b.description ?? '—'}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => { setEditBox(b); setBoxDialogOpen(true) }}
                            className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition-colors"
                          >
                            <Pencil size={15} strokeWidth={2.5} />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(b)}
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
      <BoxDialog
        open={boxDialogOpen}
        onClose={() => { setBoxDialogOpen(false); setEditBox(null) }}
        onSubmit={data => {
          if (editBox) {
            updateMutation.mutate({ id: editBox.box_id, data })
          } else {
            createMutation.mutate(data)
          }
        }}
        box={editBox}
        loading={createMutation.isPending || updateMutation.isPending}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Box Type"
        message={
          <>
            Are you sure you want to delete{' '}
            <span className="font-semibold text-neutral-800">{deleteTarget?.name}</span>
            ? This cannot be undone.
          </>
        }
        confirmLabel="Delete"
        onConfirm={() => {
          if (!deleteTarget) return
          deleteMutation.mutate(deleteTarget.box_id)
          setDeleteTarget(null)
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      <Toast toasts={toasts} onRemove={removeToast} />
    </>
  )
}