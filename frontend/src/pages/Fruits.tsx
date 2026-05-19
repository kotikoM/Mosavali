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
import { Plus, ChevronUp, ChevronDown } from 'lucide-react'
import { getFruits, createFruit } from '../api/fruits'
import type { Fruit, FruitCreate } from '../api/fruits'
import FruitDialog from '../components/FruitDialog'
import Toast from '../components/Toast'
import { useToast } from '../hooks/useToast'
import axios from 'axios'

export default function Fruits() {
  const queryClient                       = useQueryClient()
  const { toasts, addToast, removeToast } = useToast()
  const [dialogOpen, setDialogOpen]       = useState(false)
  const [globalFilter, setGlobalFilter]   = useState('')
  const [sorting, setSorting]             = useState<SortingState>([])

  const { data: fruits = [], isLoading } = useQuery({
    queryKey: ['fruits'],
    queryFn:  getFruits,
  })

  const createMutation = useMutation({
    mutationFn: (data: FruitCreate) => createFruit(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fruits'] })
      setDialogOpen(false)
      addToast('Fruit added successfully', 'success')
    },
    onError: (error) => {
      if (axios.isAxiosError(error) && error.response?.status === 400) {
        addToast(error.response.data.detail, 'error')
      } else {
        addToast('Failed to add fruit', 'error')
      }
    }
  })

  const columns = useMemo<ColumnDef<Fruit>[]>(() => [
    {
      header: 'Fruit Type',
      accessorKey: 'fruit_type',
      cell: info => (
        <span className="inline-flex items-center px-3 py-1 rounded-md text-xs font-bold bg-neutral-800 text-white uppercase tracking-wide">
          {info.getValue<string>()}
        </span>
      ),
    },
    {
      header: 'Variety Name',
      accessorKey: 'variety_name',
      cell: info => (
        <span className="text-base font-semibold text-neutral-800 capitalize">
          {info.getValue<string>()}
        </span>
      ),
    },
    {
      header: 'Code / ID',
      accessorKey: 'fruit_id',
      cell: info => (
        <span className="font-mono text-sm text-neutral-400">
          FR-{String(info.getValue<number>()).padStart(3, '0')}
        </span>
      ),
    },
  ], [])

  const table = useReactTable({
    data: fruits,
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
          <h1 className="text-3xl font-bold text-neutral-800">
            Fruit <span className="font-light text-neutral-400">Inventory</span>
          </h1>
        </div>
        <button
          onClick={() => setDialogOpen(true)}
          className="flex items-center gap-2 w-fit px-5 py-2.5 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary transition-colors"
        >
          <Plus size={17} strokeWidth={2.5} />
          Add New Fruit
        </button>
      </div>


      {/* Table card */}
      <div className="bg-white rounded-2xl border border-neutral-100 overflow-hidden">

        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
          <p className="text-base font-semibold text-neutral-800">Fruit Catalogue</p>
          <input
            value={globalFilter}
            onChange={e => setGlobalFilter(e.target.value)}
            placeholder="Search cultivars..."
            className="px-4 py-2 text-sm rounded-lg bg-neutral-50 border border-neutral-200 outline-none focus:border-primary w-56 transition-colors"
          />
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-neutral-400 text-sm">Loading...</div>
        ) : (
          <table className="w-full">
            <thead>
              {table.getHeaderGroups().map(hg => (
                <tr key={hg.id} className="border-b border-neutral-100 bg-neutral-50">
                  {hg.headers.map(header => (
                    <th
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className="px-6 py-4 text-left text-xs font-bold text-neutral-400 uppercase tracking-widest cursor-pointer select-none"
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
                <tr key={row.id} className="border-b border-neutral-50 hover:bg-neutral-50 transition-colors">
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-6 py-5">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
              {table.getRowModel().rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="px-6 py-20 text-center text-neutral-400 text-sm">
                    No fruits found. Add your first fruit variety.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <FruitDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={data => createMutation.mutate(data)}
        loading={createMutation.isPending}
      />

      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  )
}