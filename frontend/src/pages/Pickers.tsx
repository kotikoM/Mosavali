import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getGroupedRowModel,
  flexRender,
} from '@tanstack/react-table'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import { UserPlus, ChevronUp, ChevronDown, Pencil, Trash2 } from 'lucide-react'
import { getPickers, createPicker, updatePicker, deletePicker } from '../api/pickers'
import type { Picker, PickerCreate, PickerUpdate } from '../api/pickers'
import PickerDialog from '../components/PickerDialog'
import ConfirmDialog from '../components/ConfirmDialog'
import Toast from '../components/Toast'
import { useToast } from '../hooks/useToast'
import axios from 'axios'

export default function Pickers() {
  const queryClient                       = useQueryClient()
  const { toasts, addToast, removeToast } = useToast()
  const [dialogOpen, setDialogOpen]       = useState(false)
  const [editPicker, setEditPicker]       = useState<Picker | null>(null)
  const [deleteTarget, setDeleteTarget]   = useState<Picker | null>(null)
  const [globalFilter, setGlobalFilter]   = useState('')
  const [sorting, setSorting]             = useState<SortingState>([])

  const { data: pickers = [], isLoading } = useQuery({
    queryKey: ['pickers'],
    queryFn:  getPickers,
  })

  const createMutation = useMutation({
    mutationFn: (data: PickerCreate) => createPicker(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pickers'] })
      setDialogOpen(false)
      addToast('Picker registered successfully', 'success')
    },
    onError: (error) => {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        addToast(error.response.data.detail, 'error')
      } else {
        addToast('Failed to register picker', 'error')
      }
    }
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number, data: PickerUpdate }) => updatePicker(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pickers'] })
      setDialogOpen(false)
      setEditPicker(null)
      addToast('Picker updated successfully', 'success')
    },
    onError: () => {
      addToast('Failed to update picker', 'error')
    }
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deletePicker(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pickers'] })
      addToast('Picker removed', 'success')
    },
    onError: () => {
      addToast('Failed to remove picker', 'error')
    }
  })

  const handleSubmit = (data: PickerCreate | PickerUpdate) => {
    if (editPicker) {
      updateMutation.mutate({ id: editPicker.picker_id, data: data as PickerUpdate })
    } else {
      createMutation.mutate(data as PickerCreate)
    }
  }

  const handleEdit = (picker: Picker) => {
    setEditPicker(picker)
    setDialogOpen(true)
  }

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return
    deleteMutation.mutate(deleteTarget.picker_id)
    setDeleteTarget(null)
  }

  const handleOpenCreate = () => {
    setEditPicker(null)
    setDialogOpen(true)
  }

  const formatNationalId = (id: string) =>
    `${id.slice(0, 2)}-${id.slice(2, 5)}-${id.slice(5, 11)}`

  const columns = useMemo<ColumnDef<Picker>[]>(() => [
    {
      header: 'ID',
      accessorKey: 'picker_id',
      cell: info => <span className="text-neutral-400 font-mono">#{String(info.getValue<number>()).padStart(3, '0')}</span>,
      size: 80,
    },
    {
      header: 'Name',
      id: 'name',
      accessorFn: row => `${row.first_name} ${row.last_name}`,
      cell: info => <span className="font-medium text-neutral-800">{info.getValue<string>()}</span>,
    },
    {
      header: 'National ID',
      accessorKey: 'national_id',
      cell: info => <span className="font-mono text-sm text-neutral-600">{formatNationalId(info.getValue<string>())}</span>,
    },
    {
      header: 'Origin',
      accessorKey: 'origin_place',
      cell: info => <span className="text-neutral-600">{info.getValue<string>() ?? '—'}</span>,
    },
    {
      header: 'Actions',
      id: 'actions',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleEdit(row.original)}
            className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition-colors"
          >
            <Pencil size={15} strokeWidth={2.5} />
          </button>
          <button
            onClick={() => setDeleteTarget(row.original)}
            className="p-1.5 rounded-lg hover:bg-red-50 text-neutral-400 hover:text-red-600 transition-colors"
          >
            <Trash2 size={15} strokeWidth={2.5} />
          </button>
        </div>
      ),
    },
  ], [])

  const table = useReactTable({
    data: pickers,
    columns,
    state: { globalFilter, sorting },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
  })

  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-bold text-neutral-800">Pickers</h1>
        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-2 w-fit px-5 py-2.5 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary transition-colors"
        >
          <UserPlus size={17} strokeWidth={2.5} />
          Add New Picker
        </button>
      </div>

      {/* Table card */}
      <div className="bg-white rounded-2xl border border-neutral-100 overflow-hidden">

        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
          <p className="text-base font-semibold text-neutral-800">Active Pickers</p>
          <input
            value={globalFilter}
            onChange={e => setGlobalFilter(e.target.value)}
            placeholder="Search pickers..."
            className="px-4 py-2 text-sm rounded-lg bg-neutral-50 border border-neutral-200 outline-none focus:border-primary w-52 transition-colors"
          />
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-neutral-400 text-sm">Loading...</div>
        ) : (
          <table className="w-full">
            <thead>
              {table.getHeaderGroups().map(hg => (
                <tr key={hg.id} className="border-b border-neutral-100 bg-neutral-100">
                  {hg.headers.map(header => (
                    <th
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className="px-6 py-3 text-left text-sm font-semibold text-neutral-800 uppercase tracking-wide cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === 'asc'  && <ChevronUp size={13} />}
                        {header.column.getIsSorted() === 'desc' && <ChevronDown size={13} />}
                      </div>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map(row => (
                <tr key={row.id} className="border-b border-neutral-50 hover:bg-neutral-100 transition-colors">
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-6 py-4">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
              {table.getRowModel().rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="px-6 py-16 text-center text-neutral-400 text-sm">
                    No pickers found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Picker dialog */}
      <PickerDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditPicker(null) }}
        onSubmit={handleSubmit}
        picker={editPicker}
        loading={createMutation.isPending || updateMutation.isPending}
      />

      {/* Confirm delete dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Picker"
        message={
            <>
              Are you sure you want to delete{' '}
              <span className="font-semibold text-neutral-800">
                {deleteTarget?.first_name} {deleteTarget?.last_name}
              </span>
              ? This action cannot be undone.
            </>
          }
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Toasts */}
      <Toast toasts={toasts} onRemove={removeToast} />

    </div>
  )
}