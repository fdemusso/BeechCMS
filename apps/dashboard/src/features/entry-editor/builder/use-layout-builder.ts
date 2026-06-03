// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import { useState, useCallback, useMemo } from 'react'
import {
  type FormLayout,
  type LayoutTab,
  type LayoutSection,
  type LayoutColumn,
  type Branch,
  isLayoutableBranch,
  isFullWidthBranch,
  generateDefaultLayout,
} from '@beechcms/core'
import type { Seed } from '@beechcms/core'

export interface UseLayoutBuilderArgs {
  seed: Seed
  initialLayout: FormLayout
}

export interface MoveFieldArgs {
  from: { tabId: string; sectionId: string; columnId: string }
  to: { tabId: string; sectionId: string; columnId: string }
}

export interface UseLayoutBuilderResult {
  draft: FormLayout
  activeTabId: string
  setActiveTabId: (id: string) => void
  isDirty: boolean
  addTab(): void
  renameTab(tabId: string, label: string): void
  removeTab(tabId: string): void
  reorderTabs(fromIndex: number, toIndex: number): void
  addSection(tabId: string, columnCount?: number): void
  removeSection(tabId: string, sectionId: string): void
  reorderSections(tabId: string, fromIndex: number, toIndex: number): void
  toggleSectionFlag(tabId: string, sectionId: string, flag: 'hideLabel' | 'hideBorder' | 'collapsible'): void
  renameSection(tabId: string, sectionId: string, label: string | undefined): void
  setSectionColumnCount(tabId: string, sectionId: string, n: 1 | 2 | 3 | 4): void
  reorderColumns(tabId: string, sectionId: string, fromIndex: number, toIndex: number): void
  assignField(tabId: string, sectionId: string, columnId: string, branchId: string): boolean
  clearField(tabId: string, sectionId: string, columnId: string): void
  moveField(args: MoveFieldArgs): boolean
  reset(): void
  replace(layout: FormLayout): void
  getUsedBranchIds(): Set<string>
  getAvailableBranches(): Branch[]
}

function makeColumn(id?: string): LayoutColumn {
  return { id: id ?? crypto.randomUUID(), field: null }
}

function makeSection(columnCount = 1): LayoutSection {
  const columns: LayoutColumn[] = Array.from({ length: columnCount }, () => makeColumn())
  return {
    id: crypto.randomUUID(),
    label: undefined,
    hideLabel: false,
    hideBorder: false,
    collapsible: false,
    columns,
  }
}

function wouldViolateFullWidth(section: LayoutSection, incomingBranch: Branch): boolean {
  if (isFullWidthBranch(incomingBranch)) {
    const hasOtherFields = section.columns.some((c) => c.field != null)
    if (hasOtherFields) return true
  } else {
    const hasFullWidthField = section.columns.some((c) => {
      // We can't look up the branch here without a map, so we rely on caller passing correct data
      return false
    })
    if (hasFullWidthField) return true
  }
  return false
}

function wouldViolateFullWidthWithMap(
  section: LayoutSection,
  incomingBranch: Branch,
  branchMap: Map<string, Branch>,
  excludeColumnId?: string
): boolean {
  if (isFullWidthBranch(incomingBranch)) {
    const hasOtherFields = section.columns.some(
      (c) => c.field != null && c.id !== excludeColumnId
    )
    return hasOtherFields
  } else {
    const hasFullWidthField = section.columns.some((c) => {
      if (c.id === excludeColumnId || c.field == null) return false
      const b = branchMap.get(c.field.branchId)
      return b != null && isFullWidthBranch(b)
    })
    return hasFullWidthField
  }
}

export function useLayoutBuilder({ seed, initialLayout }: UseLayoutBuilderArgs): UseLayoutBuilderResult {
  const [draft, setDraft] = useState<FormLayout>(() => structuredClone(initialLayout))
  const [storedInitial, setStoredInitial] = useState<FormLayout>(() => structuredClone(initialLayout))
  const [activeTabId, setActiveTabId] = useState<string>(() => initialLayout.tabs[0]?.id ?? '')

  const isDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(storedInitial),
    [draft, storedInitial]
  )

  const branchMap = useMemo<Map<string, Branch>>(
    () => new Map(seed.branches.map((b) => [b.id, b])),
    [seed]
  )

  const mutate = useCallback((fn: (d: FormLayout) => FormLayout) => {
    setDraft((prev) => fn(structuredClone(prev)))
  }, [])

  // ---- Tab ops ----
  const addTab = useCallback(() => {
    mutate((d) => {
      const newTab: LayoutTab = {
        id: crypto.randomUUID(),
        label: 'New Tab',
        sections: [makeSection(2)],
      }
      return { ...d, tabs: [...d.tabs, newTab] }
    })
  }, [mutate])

  const renameTab = useCallback((tabId: string, label: string) => {
    mutate((d) => ({
      ...d,
      tabs: d.tabs.map((t) => (t.id === tabId ? { ...t, label } : t)),
    }))
  }, [mutate])

  const removeTab = useCallback((tabId: string) => {
    mutate((d) => {
      const remaining = d.tabs.filter((t) => t.id !== tabId)
      return { ...d, tabs: remaining.length > 0 ? remaining : d.tabs }
    })
    setActiveTabId((prev) => {
      // handled after mutate — adjust if needed
      return prev
    })
  }, [mutate])

  const reorderTabs = useCallback((fromIndex: number, toIndex: number) => {
    mutate((d) => {
      const tabs = [...d.tabs]
      const [moved] = tabs.splice(fromIndex, 1)
      tabs.splice(toIndex, 0, moved)
      return { ...d, tabs }
    })
  }, [mutate])

  // ---- Section ops ----
  const addSection = useCallback((tabId: string, columnCount = 2) => {
    mutate((d) => ({
      ...d,
      tabs: d.tabs.map((t) =>
        t.id === tabId
          ? { ...t, sections: [...t.sections, makeSection(columnCount)] }
          : t
      ),
    }))
  }, [mutate])

  const removeSection = useCallback((tabId: string, sectionId: string) => {
    mutate((d) => ({
      ...d,
      tabs: d.tabs.map((t) =>
        t.id === tabId
          ? { ...t, sections: t.sections.filter((s) => s.id !== sectionId) }
          : t
      ),
    }))
  }, [mutate])

  const reorderSections = useCallback((tabId: string, fromIndex: number, toIndex: number) => {
    mutate((d) => ({
      ...d,
      tabs: d.tabs.map((t) => {
        if (t.id !== tabId) return t
        const sections = [...t.sections]
        const [moved] = sections.splice(fromIndex, 1)
        sections.splice(toIndex, 0, moved)
        return { ...t, sections }
      }),
    }))
  }, [mutate])

  const toggleSectionFlag = useCallback(
    (tabId: string, sectionId: string, flag: 'hideLabel' | 'hideBorder' | 'collapsible') => {
      mutate((d) => ({
        ...d,
        tabs: d.tabs.map((t) =>
          t.id === tabId
            ? {
                ...t,
                sections: t.sections.map((s) =>
                  s.id === sectionId ? { ...s, [flag]: !s[flag] } : s
                ),
              }
            : t
        ),
      }))
    },
    [mutate]
  )

  const renameSection = useCallback((tabId: string, sectionId: string, label: string | undefined) => {
    mutate((d) => ({
      ...d,
      tabs: d.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              sections: t.sections.map((s) =>
                s.id === sectionId ? { ...s, label: label || undefined } : s
              ),
            }
          : t
      ),
    }))
  }, [mutate])

  const setSectionColumnCount = useCallback(
    (tabId: string, sectionId: string, n: 1 | 2 | 3 | 4) => {
      mutate((d) => ({
        ...d,
        tabs: d.tabs.map((t) => {
          if (t.id !== tabId) return t
          return {
            ...t,
            sections: t.sections.map((s) => {
              if (s.id !== sectionId) return s
              const current = s.columns
              if (n > current.length) {
                const extra = Array.from({ length: n - current.length }, () => makeColumn())
                return { ...s, columns: [...current, ...extra] }
              }
              if (n < current.length) {
                return { ...s, columns: current.slice(0, n) }
              }
              return s
            }),
          }
        }),
      }))
    },
    [mutate]
  )

  // ---- Column ops ----
  const reorderColumns = useCallback(
    (tabId: string, sectionId: string, fromIndex: number, toIndex: number) => {
      mutate((d) => ({
        ...d,
        tabs: d.tabs.map((t) => {
          if (t.id !== tabId) return t
          return {
            ...t,
            sections: t.sections.map((s) => {
              if (s.id !== sectionId) return s
              const cols = [...s.columns]
              const [moved] = cols.splice(fromIndex, 1)
              cols.splice(toIndex, 0, moved)
              return { ...s, columns: cols }
            }),
          }
        }),
      }))
    },
    [mutate]
  )

  // ---- Field ops ----
  const assignField = useCallback(
    (tabId: string, sectionId: string, columnId: string, branchId: string): boolean => {
      const branch = branchMap.get(branchId)
      if (!branch) return false

      let rejected = false
      mutate((d) => {
        const tab = d.tabs.find((t) => t.id === tabId)
        const section = tab?.sections.find((s) => s.id === sectionId)
        if (!section) { rejected = true; return d }

        if (wouldViolateFullWidthWithMap(section, branch, branchMap, columnId)) {
          rejected = true
          return d
        }

        return {
          ...d,
          tabs: d.tabs.map((t) =>
            t.id === tabId
              ? {
                  ...t,
                  sections: t.sections.map((s) =>
                    s.id === sectionId
                      ? {
                          ...s,
                          columns: s.columns.map((c) =>
                            c.id === columnId ? { ...c, field: { branchId } } : c
                          ),
                        }
                      : s
                  ),
                }
              : t
          ),
        }
      })
      return !rejected
    },
    [mutate, branchMap]
  )

  const clearField = useCallback((tabId: string, sectionId: string, columnId: string) => {
    mutate((d) => ({
      ...d,
      tabs: d.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              sections: t.sections.map((s) =>
                s.id === sectionId
                  ? {
                      ...s,
                      columns: s.columns.map((c) =>
                        c.id === columnId ? { ...c, field: null } : c
                      ),
                    }
                  : s
              ),
            }
          : t
      ),
    }))
  }, [mutate])

  const moveField = useCallback(
    ({ from, to }: MoveFieldArgs): boolean => {
      let rejected = false
      mutate((d) => {
        const fromTab = d.tabs.find((t) => t.id === from.tabId)
        const fromSection = fromTab?.sections.find((s) => s.id === from.sectionId)
        const fromCol = fromSection?.columns.find((c) => c.id === from.columnId)
        const toTab = d.tabs.find((t) => t.id === to.tabId)
        const toSection = toTab?.sections.find((s) => s.id === to.sectionId)
        const toCol = toSection?.columns.find((c) => c.id === to.columnId)

        if (!fromCol || !toSection || !toCol) { rejected = true; return d }

        const incomingBranchId = fromCol.field?.branchId
        if (!incomingBranchId) return d // source is empty, nothing to move

        const incomingBranch = branchMap.get(incomingBranchId)
        if (!incomingBranch) { rejected = true; return d }

        if (wouldViolateFullWidthWithMap(toSection, incomingBranch, branchMap, to.columnId)) {
          rejected = true
          return d
        }

        // Also check reverse: if destination has a field moving to source section
        if (toCol.field) {
          const destBranch = branchMap.get(toCol.field.branchId)
          if (destBranch && fromSection && wouldViolateFullWidthWithMap(fromSection, destBranch, branchMap, from.columnId)) {
            rejected = true
            return d
          }
        }

        const fromField = fromCol.field
        const toField = toCol.field

        return {
          ...d,
          tabs: d.tabs.map((t) => ({
            ...t,
            sections: t.sections.map((s) => ({
              ...s,
              columns: s.columns.map((c) => {
                if (t.id === from.tabId && s.id === from.sectionId && c.id === from.columnId) {
                  return { ...c, field: toField }
                }
                if (t.id === to.tabId && s.id === to.sectionId && c.id === to.columnId) {
                  return { ...c, field: fromField }
                }
                return c
              }),
            })),
          })),
        }
      })
      return !rejected
    },
    [mutate, branchMap]
  )

  const reset = useCallback(() => {
    const fresh = generateDefaultLayout(seed)
    setDraft(structuredClone(fresh))
    setStoredInitial(structuredClone(fresh))
    setActiveTabId(fresh.tabs[0]?.id ?? '')
  }, [seed])

  const replace = useCallback((layout: FormLayout) => {
    setDraft(structuredClone(layout))
    setStoredInitial(structuredClone(layout))
    setActiveTabId(layout.tabs[0]?.id ?? '')
  }, [])

  const getUsedBranchIds = useCallback((): Set<string> => {
    const ids = new Set<string>()
    for (const tab of draft.tabs) {
      for (const section of tab.sections) {
        for (const col of section.columns) {
          if (col.field) ids.add(col.field.branchId)
        }
      }
    }
    return ids
  }, [draft])

  const getAvailableBranches = useCallback((): Branch[] => {
    const used = getUsedBranchIds()
    return seed.branches.filter(
      (b) => isLayoutableBranch(b as Branch) && !used.has((b as Branch).id)
    ) as Branch[]
  }, [seed, getUsedBranchIds])

  return {
    draft,
    activeTabId,
    setActiveTabId,
    isDirty,
    addTab,
    renameTab,
    removeTab,
    reorderTabs,
    addSection,
    removeSection,
    reorderSections,
    toggleSectionFlag,
    renameSection,
    setSectionColumnCount,
    reorderColumns,
    assignField,
    clearField,
    moveField,
    reset,
    replace,
    getUsedBranchIds,
    getAvailableBranches,
  }
}
