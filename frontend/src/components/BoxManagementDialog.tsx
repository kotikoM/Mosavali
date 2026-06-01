import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Plus } from 'lucide-react'
import { getBoxes, createBox } from '../api/boxes'
import type { BoxCreate } from '../api/boxes'
import BoxDialog from './BoxDialogue'
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

  const { data: boxes = [], isLoading } = useQuery({
    queryKey: ['boxes'],
    queryFn:  getBoxes,
    enabled:  open,
  })

  const createMutation = useMutation({
    mutationFn: (data: BoxCreate) => createBox(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boxes'] })
      addToast('Box type created successfully', 'success')
      setBoxDialogOpen(false)
    },
    onError: (error) => {
      if (axios.isAxiosError(error) && error.response?.status === 400) {
        addToast(error.response.data.detail, 'error')
      } else {
        addToast('Failed to create box type', 'error')
      }
    },
  })

  if (!open) return null

  return (
    <>
      {/* Management modal — z-40 so BoxDialog at z-50 renders on top */}
      <div className="fixed inset-0 z-40 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />

        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col overflow-hidden max-h-[80vh]">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b-2 border-neutral-100 shrink-0">
            <div className="flex items-center gap-4">
              <div>
                <h2 className="text-xl font-black text-neutral-900">Box Types</h2>
                <p className="text-sm text-neutral-400 mt-0.5">{boxes.length} registered</p>
              </div>
              <div className="w-px h-8 bg-neutral-200" />
              <button
                onClick={() => setBoxDialogOpen(true)}
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
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-16 text-neutral-400 text-sm">Loading...</div>
            ) : boxes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2">
                <p className="text-neutral-400 text-sm">No box types yet — add your first one.</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-neutral-100 bg-neutral-50">
                    <th className="px-6 py-4 text-left text-xs font-bold text-neutral-500 uppercase tracking-widest">ID</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-neutral-500 uppercase tracking-widest">Name</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-neutral-500 uppercase tracking-widest">Empty</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-neutral-500 uppercase tracking-widest">Full</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-neutral-500 uppercase tracking-widest">Net</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-neutral-500 uppercase tracking-widest">Description</th>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

        </div>
      </div>

      {/* BoxDialog at z-50 — renders on top */}
      <BoxDialog
        open={boxDialogOpen}
        onClose={() => setBoxDialogOpen(false)}
        onSubmit={data => createMutation.mutate(data)}
        loading={createMutation.isPending}
      />

      <Toast toasts={toasts} onRemove={removeToast} />
    </>
  )
}