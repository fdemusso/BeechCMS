import * as React from 'react'
import type { KanbanCompatibility, KanbanConfig, Branch } from '@beechcms/core'
import type { KanbanBoardConfig } from './types'
import { KANBAN_MAX_COLUMNS } from './constants'
import { resolveKanbanColumns } from '@beechcms/core'

interface KanbanAxisConfigProps {
  compat: KanbanCompatibility
  config: KanbanBoardConfig
  branches: Branch[]
  onChange: (next: KanbanConfig) => void
  isSaving?: boolean
}

export function KanbanAxisConfig({ compat, config, branches, onChange, isSaving }: KanbanAxisConfigProps) {
  const axisBranch = branches.find(b => b.id === config.axisBranchId)
  const allCols = axisBranch ? resolveKanbanColumns(axisBranch) : []
  const needsVisibilitySelector = allCols.length > KANBAN_MAX_COLUMNS

  function setAxis(branchId: string) {
    onChange({ axisBranchId: branchId, sort: config.sort ?? null, hiddenColumnValues: config.hiddenColumnValues })
  }

  function setSort(branchId: string, dir: 'ASC' | 'DESC') {
    onChange({ axisBranchId: config.axisBranchId, sort: { branchId, dir }, hiddenColumnValues: config.hiddenColumnValues })
  }

  function clearSort() {
    onChange({ axisBranchId: config.axisBranchId, sort: null, hiddenColumnValues: config.hiddenColumnValues })
  }

  function toggleHidden(value: string) {
    const hidden = new Set(config.hiddenColumnValues ?? [])
    if (hidden.has(value)) {
      hidden.delete(value)
    } else {
      hidden.add(value)
    }
    onChange({ axisBranchId: config.axisBranchId, sort: config.sort ?? null, hiddenColumnValues: [...hidden] })
  }

  return (
    <div className="flex flex-col gap-4 p-4 rounded-lg border bg-muted/20 max-w-md">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium">Raggruppa per</label>
        <select
          className="rounded border bg-background px-2 py-1.5 text-sm"
          value={config.axisBranchId ?? ''}
          onChange={e => setAxis(e.target.value)}
          disabled={isSaving}
        >
          <option value="" disabled>Seleziona un campo…</option>
          {compat.candidates.map(c => (
            <option key={c.branchId} value={c.branchId}>{c.label}</option>
          ))}
        </select>
      </div>

      {axisBranch && (
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">Ordinamento schede</label>
          <div className="flex items-center gap-2">
            <select
              className="rounded border bg-background px-2 py-1.5 text-sm flex-1"
              value={config.sort?.branchId ?? ''}
              onChange={e => e.target.value ? setSort(e.target.value, config.sort?.dir ?? 'ASC') : clearSort()}
              disabled={isSaving}
            >
              <option value="">Manuale (posizione kanban)</option>
              {branches.filter(b => b.type === 'text' || b.type === 'number' || b.type === 'date').map(b => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
            </select>
            {config.sort && (
              <select
                className="rounded border bg-background px-2 py-1.5 text-sm"
                value={config.sort.dir}
                onChange={e => setSort(config.sort!.branchId, e.target.value as 'ASC' | 'DESC')}
                disabled={isSaving}
              >
                <option value="ASC">↑ A→Z</option>
                <option value="DESC">↓ Z→A</option>
              </select>
            )}
          </div>
        </div>
      )}

      {needsVisibilitySelector && axisBranch && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-amber-600 dark:text-amber-500">
            Questo campo genera {allCols.length} colonne. Ne sono mostrate al massimo {KANBAN_MAX_COLUMNS};
            scegli quali visualizzare qui sotto.
          </p>
          <label className="text-sm font-medium">Colonne visibili (max {KANBAN_MAX_COLUMNS})</label>
          <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
            {allCols.filter(c => c.value !== null).map(c => {
              const hidden = (config.hiddenColumnValues ?? []).includes(c.value!)
              return (
                <label key={c.value} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!hidden}
                    onChange={() => toggleHidden(c.value!)}
                    disabled={isSaving}
                  />
                  {c.label}
                </label>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
