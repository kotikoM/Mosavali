import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import { ChevronDown, ChevronUp, Plus } from 'lucide-react'
import axios from 'axios'

import { createBox, getBoxes } from '../api/boxes'
import type { Box, BoxCreate } from '../api/boxes'

import BoxDialogue from '../components/BoxDialogue'
import Toast from '../components/Toast'
import { useToast } from '../hooks/useToast'

function formatKg(value: string | number) {
  return `${Number(value).toFixed(3)} kg`
}

function formatBoxId(id: number) {
  return `B-${String(id).padStart(3, '0')}`
}

export default function Boxes() {
  const queryClient = useQueryClient()

  const { toasts, addToast, removeToast } = useToast()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [globalFilter, setGlobalFilter] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])

  const { data: boxes = [], isLoading } = useQuery({
    queryKey: ['boxes'],
    queryFn: getBoxes,
  })

  const createMutation = useMutation({
    mutationFn: (data: BoxCreate) => createBox(data),

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boxes'] })
      setDialogOpen(false)

      addToast('Box type created successfully', 'success')
    },

    onError: error => {
      if (axios.isAxiosError(error) && error.response?.status === 400) {
        addToast(error.response.data.detail, 'error')
      } else {
        addToast('Failed to create box type', 'error')
      }
    },
  })

  const columns = useMemo<ColumnDef<Box>[]>(
    () => [
      {
        header: 'ID',
        accessorKey: 'box_id',

        cell: info => (
          <span className="font-mono text-sm text-neutral-400">
            B-{String(info.getValue<number>()).padStart(3, '0')}
          </span>
        ),
      },
      {
        header: 'Box Name',
        accessorKey: 'name',

        cell: info => (
          <div className="flex flex-col">
            <span className="text-base font-semibold text-neutral-800 capitalize">
              {info.getValue<string>()}
            </span>
          </div>
        ),
      },

      {
        header: 'Empty (kg)',
        accessorKey: 'empty_weight_kg',

        cell: info => (
          <span className="font-mono text-sm font-semibold text-neutral-700">
            {formatKg(info.getValue<string>())}
          </span>
        ),
      },

      {
        header: 'Full (kg)',
        accessorKey: 'full_weight_kg',

        cell: info => (
          <span className="font-mono text-sm font-semibold text-neutral-700">
            {formatKg(info.getValue<string>())}
          </span>
        ),
      },

      {
        header: 'Net (kg)',
        accessorKey: 'net_weight_kg',

        cell: info => (
          <span className="rounded-lg bg-primary-100 px-3 py-1 font-mono text-sm font-bold text-primary-800">
            {formatKg(info.getValue<string>())}
          </span>
        ),
      },

      {
        header: 'Description',
        accessorKey: 'description',

        cell: info => (
          <p className="max-w-xs truncate text-sm text-neutral-500">
            {info.getValue<string>() || '—'}
          </p>
        ),
      },
    ],
    []
  )

  const table = useReactTable({
    data: boxes,
    columns,

    state: {
      globalFilter,
      sorting,
    },

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
            <h1 className="text-3xl font-bold text-neutral-800">
              Box Types
            </h1>

            <p className="mt-2 text-sm text-neutral-500">
              Configure harvesting containers and calibrated weight profiles.
            </p>
          </div>

          <button
            onClick={() => setDialogOpen(true)}
            className="flex items-center gap-2 w-fit px-5 py-2.5 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary transition-colors"
          >
            <Plus size={17} strokeWidth={2.5} />
            Add Box Type
          </button>

        </div>

        {/* Table Card */}
        <div className="overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-sm">

          {/* Toolbar */}
          <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-5">

            <div>
              <p className="text-lg font-semibold text-neutral-900">
                Box Catalogue
              </p>

              <p className="text-sm text-neutral-400">
                {boxes.length} registered
              </p>
            </div>

            <input
              value={globalFilter}
              onChange={e => setGlobalFilter(e.target.value)}
              placeholder="Search box types..."
              className="w-64 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm outline-none transition-all focus:border-primary focus:bg-white"
            />

          </div>

          {/* Table */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-sm text-neutral-400">
              Loading ...
            </div>
          ) : (
            <table className="w-full">
              <thead>
                {table.getHeaderGroups().map(headerGroup => (
                  <tr key={headerGroup.id} className="border-b border-neutral-100 bg-neutral-50">

                    {headerGroup.headers.map(header => (
                      <th
                        key={header.id}
                        onClick={header.column.getToggleSortingHandler()}
                        className="px-6 py-4 text-left text-xs font-bold text-neutral-400 uppercase tracking-widest cursor-pointer select-none"
                      >
                        <div className="flex items-center gap-1">
                          {flexRender(header.column.columnDef.header,header.getContext())}
                          {header.column.getIsSorted() === 'asc' && (<ChevronUp size={13} />)}
                          {header.column.getIsSorted() === 'desc' && (<ChevronDown size={13} />)}
                        </div>
                      </th>
                    ))}

                  </tr>
                ))}
              </thead>

              <tbody>
                {table.getRowModel().rows.map(row => (
                  <tr key={row.id} className="border-b border-neutral-50 hover:bg-neutral-50 transition-colors">
                    {row.getVisibleCells().map(cell => (
                      <td key={cell.id} className="px-6 py-5">
                        {flexRender(cell.column.columnDef.cell,cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}

                {table.getRowModel().rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={columns.length}
                      className="px-6 py-24 text-center"
                    >
                      <div className="flex flex-col items-center gap-3">
                        <div className="text-5xl">📦</div>

                        <div>
                          <p className="font-semibold text-neutral-700">
                            No box types configured
                          </p>

                          <p className="mt-1 text-sm text-neutral-400">
                            Create your first harvesting container profile.
                          </p>
                        </div>

                      </div>
                    </td>
                  </tr>
                )}
              </tbody>

            </table>
          )}

        </div>

      <BoxDialogue
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={data => createMutation.mutate(data)}
        loading={createMutation.isPending}
      />

      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  )
}