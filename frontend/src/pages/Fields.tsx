import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  flexRender,
} from '@tanstack/react-table'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import { Plus, ChevronUp, ChevronDown, Pencil, Trash2 } from 'lucide-react'
import { getFields, createField, updateField, deleteField } from '../api/fields'
import type { Field, FieldCreate } from '../api/fields'
import FieldDialog from '../components/FieldDialog'
import ConfirmDialog from '../components/ConfirmDialog'
import Toast from '../components/Toast'
import { useToast } from '../hooks/useToast'
import axios from 'axios'

export default function Fields() {
  const queryClient                       = useQueryClient()
  const { toasts, addToast, removeToast } = useToast()
  const [dialogOpen, setDialogOpen]       = useState(false)
  const [editField, setEditField]         = useState<Field | null>(null)
  const [deleteTarget, setDeleteTarget]   = useState<Field | null>(null)
  const [globalFilter, setGlobalFilter]   = useState('')
  const [sorting, setSorting]             = useState<SortingState>([])

  const { data: fields = [], isLoading } = useQuery({
    queryKey: ['fields'],
    queryFn:  getFields,
  })

  const createMutation = useMutation({
    mutationFn: (data: FieldCreate) => createField(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fields'] })
      setDialogOpen(false)
      addToast('Field added successfully', 'success')
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
      setDialogOpen(false)
      setEditField(null)
      addToast('Field updated successfully', 'success')
    },
    onError: () => addToast('Failed to update field', 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteField(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fields'] })
      addToast('Field removed', 'success')
    },
    onError: () => addToast('Failed to remove field', 'error'),
  })

  const handleSubmit = (data: FieldCreate) => {
    if (editField) {
      updateMutation.mutate({ id: editField.field_id, data })
    } else {
      createMutation.mutate(data)
    }
  }

  const handleEdit = (field: Field) => {
    setEditField(field)
    setDialogOpen(true)
  }

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return
    deleteMutation.mutate(deleteTarget.field_id)
    setDeleteTarget(null)
  }

  const columns = useMemo<ColumnDef<Field>[]>(() => [
    {
      header: 'ID',
      accessorKey: 'field_id',
      cell: info => (
        <span className="font-mono text-sm text-neutral-400">
          F-{String(info.getValue<number>()).padStart(3, '0')}
        </span>
      ),
    },
    {
      header: 'Field Name',
      accessorKey: 'field_name',
      cell: info => (
        <span className="text-base font-semibold text-neutral-800">
          {info.getValue<string>()}
        </span>
      ),
    },
    {
      header: 'Description',
      accessorKey: 'description',
      cell: info => (
        <span className="text-sm text-neutral-500">
          {info.getValue<string | null>() ?? '—'}
        </span>
      ),
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
    data: fields,
    columns,
    state: { globalFilter, sorting },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-800">Fields</h1>
          <p className="mt-2 text-sm text-neutral-500">Configure harvest fields.</p>
        </div>
        <button
          onClick={() => { setEditField(null); setDialogOpen(true) }}
          className="flex items-center gap-3 w-fit px-6 py-3 bg-primary-700 text-white font-semibold rounded-xl hover:bg-primary transition-colors"
        >
          <Plus size={17} strokeWidth={2.5} />
          Add New Field
        </button>
      </div>

      {/* Table card */}
      <div className="overflow-hidden rounded-2xl border-2 border-neutral-200 bg-white shadow-lg">

        <div className="flex items-center justify-between border-b-2 border-neutral-100 px-6 py-5">
          <div>
            <p className="text-xl font-bold text-neutral-900">Field Catalogue</p>
            <p className="text-sm text-neutral-400">{fields.length} registered</p>
          </div>
          <input
            value={globalFilter}
            onChange={e => setGlobalFilter(e.target.value)}
            placeholder="Search fields..."
            className="w-64 rounded-xl border-2 border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm outline-none transition-all focus:border-primary focus:bg-white"
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-neutral-400 text-sm">Loading...</div>
        ) : (
          <table className="w-full">
            <thead>
              {table.getHeaderGroups().map(hg => (
                <tr key={hg.id} className="border-b-2 border-neutral-100 bg-neutral-50">
                  {hg.headers.map(header => (
                    <th
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className="px-6 py-4 text-left text-xs font-bold text-neutral-500 uppercase tracking-widest cursor-pointer select-none"
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
                <tr key={row.id} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-6 py-4">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
              {table.getRowModel().rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="px-6 py-20 text-center text-neutral-400 text-sm">
                    No fields found. Add your first harvest field.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <FieldDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditField(null) }}
        onSubmit={handleSubmit}
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
            ? This action cannot be undone.
          </>
        }
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />

      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  )
}