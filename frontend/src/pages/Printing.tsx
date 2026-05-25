import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  flexRender,
} from '@tanstack/react-table'
import type { ColumnDef, SortingState, ColumnFiltersState } from '@tanstack/react-table'
import { Printer, Plus, Trash2, ChevronUp, ChevronDown, X } from 'lucide-react'
import { getPickers } from '../api/pickers'
import { getFruits } from '../api/fruits'
import { createPrintBatch } from '../api/printBatches'
import type { Picker } from '../api/pickers'
import type { Fruit } from '../api/fruits'
import Toast from '../components/Toast'
import { useToast } from '../hooks/useToast'
import axios from 'axios'

interface QueueEntry {
  id:       string
  picker:   Picker
  fruit:    Fruit
  quantity: number
}

export default function Printing() {
  const queryClient                         = useQueryClient()
  const { toasts, addToast, removeToast }   = useToast()

  const [sorting, setSorting]               = useState<SortingState>([])
  const [columnFilters, setColumnFilters]   = useState<ColumnFiltersState>([])
  const [selectedPickers, setSelectedPickers] = useState<Set<number>>(new Set())
  const [selectedFruit, setSelectedFruit]   = useState<Fruit | null>(null)
  const [quantity, setQuantity]             = useState<number>(15)
  const [queue, setQueue]                   = useState<QueueEntry[]>([])

  const { data: pickers = [], isLoading: pickersLoading } = useQuery({
    queryKey: ['pickers'],
    queryFn:  getPickers,
  })

  const { data: fruits = [] } = useQuery({
    queryKey: ['fruits'],
    queryFn:  getFruits,
  })

  const printMutation = useMutation({
    mutationFn: () => createPrintBatch({
      items: queue.map(q => ({
        picker_id: q.picker.picker_id,
        fruit_id:  q.fruit.fruit_id,
        quantity:  q.quantity,
      }))
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['print-batches'] })
      setQueue([])
      addToast(`${queue.length} batch(es) sent to print successfully`, 'success')
    },
    onError: (error) => {
      if (axios.isAxiosError(error)) {
        addToast(error.response?.data?.detail ?? 'Failed to print', 'error')
      } else {
        addToast('Failed to print batch', 'error')
      }
    }
  })

  const togglePicker = (id: number) => {
    setSelectedPickers(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleAddToQueue = () => {
    if (!selectedFruit || selectedPickers.size === 0 || quantity < 1) return

    const newEntries: QueueEntry[] = []
    const skipped: string[] = []

    pickers
      .filter(p => selectedPickers.has(p.picker_id))
      .forEach(picker => {
        const alreadyInQueue = queue.some(
          q => q.picker.picker_id === picker.picker_id && q.fruit.fruit_id === selectedFruit.fruit_id
        )
        if (alreadyInQueue) {
          skipped.push(`${picker.first_name} ${picker.last_name}`)
        } else {
          newEntries.push({
            id:      crypto.randomUUID(),
            picker,
            fruit:   selectedFruit,
            quantity,
          })
        }
      })

    if (newEntries.length > 0) {
      setQueue(prev => [...prev, ...newEntries])
      addToast(`Added ${newEntries.length} picker(s) to queue`, 'success')
    }
    if (skipped.length > 0) {
      addToast(`Skipped ${skipped.length} duplicate(s)`, 'error')
    }

    setSelectedPickers(new Set())
    setQuantity(50)
  }

  const formatNationalId = (id: string) =>
    `${id.slice(0, 2)}-${id.slice(2, 5)}-${id.slice(5, 11)}`

  const columns = useMemo<ColumnDef<Picker>[]>(() => [
    {
      id: 'select',
      enableSorting: false,
      enableColumnFilter: false,
      header: ({ table }) => {
        const visibleIds = table.getFilteredRowModel().rows.map(r => r.original.picker_id)
        const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedPickers.has(id))
        const someSelected = visibleIds.some(id => selectedPickers.has(id))
        return (
          <input
            type="checkbox"
            checked={allSelected}
            ref={el => { if (el) el.indeterminate = someSelected && !allSelected }}
            onChange={() => {
              if (allSelected) {
                setSelectedPickers(prev => {
                  const next = new Set(prev)
                  visibleIds.forEach(id => next.delete(id))
                  return next
                })
              } else {
                setSelectedPickers(prev => {
                  const next = new Set(prev)
                  visibleIds.forEach(id => next.add(id))
                  return next
                })
              }
            }}
            className="w-4 h-4 rounded accent-primary cursor-pointer"
          />
        )
      },
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={selectedPickers.has(row.original.picker_id)}
          onChange={() => togglePicker(row.original.picker_id)}
          className="w-4 h-4 rounded accent-primary cursor-pointer"
          onClick={e => e.stopPropagation()}
        />
      ),
    },
    {
      header: 'Name',
      id: 'name',
      enableColumnFilter: true,
      accessorFn: row => `${row.first_name} ${row.last_name}`,
      filterFn: 'includesString',
      cell: info => (
        <span className="font-medium text-neutral-800">{info.getValue<string>()}</span>
      ),
    },
    {
      header: 'National ID',
      accessorKey: 'national_id',
      filterFn: 'includesString',
      enableColumnFilter: true,
      cell: info => (
        <span className="font-mono text-sm text-neutral-600">
          {formatNationalId(info.getValue<string>())}
        </span>
      ),
    },
    {
      header: 'Origin',
      accessorKey: 'origin_place',
      filterFn: 'includesString',
      enableColumnFilter: true,
      cell: info => (
        <span className="text-sm text-neutral-600">{info.getValue<string>() ?? '—'}</span>
      ),
    },
  ], [selectedPickers])

  const table = useReactTable({
    data: pickers,
    columns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const totalStickers = queue.reduce((sum, q) => sum + q.quantity, 0)

  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-neutral-800">Printing</h1>
        <p className="text-sm text-neutral-500">Select pickers and queue sticker batches for printing.</p>
      </div>

      <div className="flex gap-6 items-start">

        {/* Left — picker table */}
        <div className="flex-1 overflow-hidden rounded-[2rem] border border-neutral-200 bg-white shadow-sm">

          {/* Toolbar */}
          <div className="flex items-start justify-between border-b border-neutral-100 px-6 py-5">
            <div>
              <p className="text-lg font-semibold text-neutral-900">Select Pickers</p>
              <p className="text-sm text-neutral-400">
                {pickers.length} registered
                {selectedPickers.size > 0 && (
                  <span className="ml-2 font-bold text-primary-700">
                    · {selectedPickers.size} selected
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Table */}
          {pickersLoading ? (
            <div className="flex items-center justify-center py-16 text-neutral-400 text-sm">Loading...</div>
          ) : (
            <table className="w-full">
              <thead>
                {table.getHeaderGroups().map(hg => (
                  <tr key={hg.id} className="border-b border-neutral-100 bg-neutral-50">
                    {hg.headers.map(header => (
                      <th
                        key={header.id}
                        className="px-6 py-3 text-left"
                      >
                        {/* Column label + sort */}
                        <div
                          onClick={header.column.getToggleSortingHandler()}
                          className="flex items-center gap-1 text-xs font-bold text-neutral-400 uppercase tracking-widest cursor-pointer select-none mb-2"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getIsSorted() === 'asc'  && <ChevronUp size={12} />}
                          {header.column.getIsSorted() === 'desc' && <ChevronDown size={12} />}
                        </div>

                        {/* Per-column filter */}
                        {header.column.getCanFilter() && (
                          <div className="relative">
                            <input
                              value={(header.column.getFilterValue() as string) ?? ''}
                              onChange={e => header.column.setFilterValue(e.target.value)}
                              placeholder={`Filter...`}
                              className="w-full px-3 py-1.5 pr-6 text-xs rounded-lg border-2 border-neutral-200 bg-white outline-none focus:border-primary transition-colors placeholder:text-neutral-300 font-normal text-neutral-700"
                            />
                            {(header.column.getFilterValue() as string) && (
                              <button
                                onClick={() => header.column.setFilterValue('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-300 hover:text-neutral-500"
                              >
                                <X size={11} />
                              </button>
                            )}
                          </div>
                        )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map(row => {
                  const isSelected = selectedPickers.has(row.original.picker_id)
                  return (
                    <tr
                      key={row.id}
                      onClick={() => togglePicker(row.original.picker_id)}
                      className={`border-b border-neutral-50 cursor-pointer transition-all
                        ${isSelected
                          ? 'bg-primary-50 border-l-[3px] border-l-primary-700'
                          : 'hover:bg-neutral-50 border-l-[3px] border-l-transparent'
                        }`}
                    >
                      {row.getVisibleCells().map(cell => (
                        <td key={cell.id} className="px-6 py-4">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  )
                })}
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

        {/* Right — config + queue */}
        <div className="w-80 shrink-0 flex flex-col gap-4">

          {/* Add to queue form */}
          <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-6 flex flex-col gap-4">
            <p className="text-xs font-black text-neutral-400 uppercase tracking-widest">Add to Queue</p>

            {/* Selected pickers summary */}
            <div>
              <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">
                Selected Pickers
              </label>
              <div className={`mt-1.5 px-4 py-3 rounded-xl border text-sm transition-colors
                ${selectedPickers.size > 0
                  ? 'border-primary-200 bg-primary-50 text-primary-800 font-semibold'
                  : 'border-neutral-200 bg-neutral-50 text-neutral-400 italic'
                }`}
              >
                {selectedPickers.size > 0
                  ? `${selectedPickers.size} picker${selectedPickers.size > 1 ? 's' : ''} selected`
                  : 'Click rows or use checkboxes'
                }
              </div>
            </div>

            {/* Fruit selector */}
            <div>
              <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">Fruit</label>
              <select
                value={selectedFruit?.fruit_id ?? ''}
                onChange={e => {
                  const fruit = fruits.find(f => f.fruit_id === Number(e.target.value))
                  setSelectedFruit(fruit ?? null)
                }}
                className={`mt-1.5 w-full px-4 py-3 rounded-xl border bg-neutral-50 text-sm outline-none focus:border-primary transition-colors
                  ${!selectedFruit ? 'text-neutral-400 border-neutral-200' : 'text-neutral-800 border-neutral-200'}`}
              >
                <option value="" disabled>Select fruit...</option>
                {fruits.map(fruit => (
                  <option key={fruit.fruit_id} value={fruit.fruit_id}>
                    {fruit.variety_name} ({fruit.fruit_type})
                  </option>
                ))}
              </select>
            </div>

            {/* Quantity */}
            <div>
              <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">
                Stickers per Picker
              </label>
              <input
                type="number"
                min={1}
                max={999}
                value={quantity}
                onChange={e => setQuantity(Number(e.target.value))}
                className="mt-1.5 w-full px-4 py-3 rounded-xl border border-neutral-200 bg-neutral-50 text-sm outline-none focus:border-primary transition-colors"
              />
              {selectedPickers.size > 1 && (
                <p className="text-xs text-neutral-400 mt-1">
                  {quantity} × {selectedPickers.size} pickers = <span className="font-bold text-neutral-600">{quantity * selectedPickers.size}</span> total stickers
                </p>
              )}
            </div>

            <button
              onClick={handleAddToQueue}
              disabled={selectedPickers.size === 0 || !selectedFruit || quantity < 1}
              className="w-full py-3 rounded-xl bg-primary-700 text-white text-sm font-bold hover:bg-primary transition-colors disabled:opacity-30 flex items-center justify-center gap-2"
            >
              <Plus size={16} strokeWidth={2.5} />
              Add {selectedPickers.size > 1 ? `${selectedPickers.size} Pickers` : 'to Queue'}
            </button>
          </div>

          {/* Queue */}
          <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100">
              <p className="text-xs font-black text-neutral-400 uppercase tracking-widest">Print Queue</p>
              {queue.length > 0 && (
                <span className="text-xs font-bold text-primary-700 bg-primary-50 px-2.5 py-1 rounded-full">
                  {queue.length} batch{queue.length > 1 ? 'es' : ''}
                </span>
              )}
            </div>

            {queue.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Printer size={24} className="text-neutral-200" />
                <p className="text-sm text-neutral-300">Queue is empty</p>
              </div>
            ) : (
              <>
                <div className="flex flex-col max-h-72 overflow-y-auto">
                  {queue.map(item => (
                    <div key={item.id} className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-50 hover:bg-neutral-50 transition-colors">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-semibold text-neutral-800">
                          {item.picker.first_name} {item.picker.last_name}
                        </span>
                        <span className="text-xs text-neutral-400 capitalize">
                          {item.fruit.variety_name} · <span className="font-bold text-neutral-600">{item.quantity}</span> stickers
                        </span>
                      </div>
                      <button
                        onClick={() => setQueue(prev => prev.filter(q => q.id !== item.id))}
                        className="text-neutral-200 hover:text-red-500 transition-colors p-1 rounded"
                      >
                        <Trash2 size={14} strokeWidth={2.5} />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Footer */}
                <div className="px-5 py-4 bg-neutral-50 flex flex-col gap-3 border-t border-neutral-100">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-neutral-500">Total stickers</span>
                    <span className="text-xl font-black text-neutral-800">{totalStickers}</span>
                  </div>
                  <button
                    onClick={() => printMutation.mutate()}
                    disabled={printMutation.isPending}
                    className="w-full py-4 rounded-xl bg-primary-700 text-white font-bold hover:bg-primary transition-colors disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg shadow-primary-900/20"
                  >
                    <Printer size={17} strokeWidth={2.5} />
                    {printMutation.isPending ? 'Printing...' : `Print ${queue.length} Batch${queue.length > 1 ? 'es' : ''}`}
                  </button>
                </div>
              </>
            )}
          </div>

        </div>
      </div>

      <Toast toasts={toasts} onRemove={removeToast} />
    </div>
  )
}