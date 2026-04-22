import { useMemo } from "react"
import { resolvePolicies } from "@beech/core"
import type { Seed } from "@beech/core"

interface SortState {
  columnId: string | null
  desc: boolean
}

interface UseToolbarSortProps {
  seed: Seed
  sortColumnSearchTerm: string
  sortState?: SortState
  onSortChange?: (state: SortState) => void
}

export function useToolbarSort({
  seed,
  sortColumnSearchTerm,
  sortState,
  onSortChange,
}: UseToolbarSortProps) {
  const sortableBranches = useMemo(
    () =>
      seed.branches.filter(
        (branch) =>
          ["text", "number", "date"].includes(branch.type as string) &&
          resolvePolicies(branch).sort,
      ),
    [seed.branches]
  )

  const filteredSortableColumns = useMemo(() => {
    const term = sortColumnSearchTerm.trim().toLowerCase()
    if (!term) return sortableBranches
    return sortableBranches.filter((branch) =>
      branch.label.toLowerCase().includes(term)
    )
  }, [sortColumnSearchTerm, sortableBranches])

  const handleToggleSortDirection = () => {
    if (!onSortChange || !sortState?.columnId) return
    onSortChange({
      columnId: sortState.columnId,
      desc: !sortState.desc,
    })
  }

  const handleSortColumnSelect = (branchAlias: string) => {
    if (!onSortChange) return

    const isCurrentlySelected = sortState?.columnId === branchAlias

    if (isCurrentlySelected) {
      onSortChange({ columnId: null, desc: true })
      return
    }

    // Mantiene la direzione di ordinamento già impostata, se presente.
    const nextDesc = sortState?.columnId == null ? true : sortState.desc
    onSortChange({ columnId: branchAlias, desc: nextDesc })
  }

  return {
    sortableBranches,
    filteredSortableColumns,
    handleToggleSortDirection,
    handleSortColumnSelect,
  }
}
