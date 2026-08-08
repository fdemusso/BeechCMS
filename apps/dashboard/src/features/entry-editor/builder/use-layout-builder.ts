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
  from: { tabId: string; sectionId: string; columnId: string; branchId: string }
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
  clearField(tabId: string, sectionId: string, columnId: string, branchId: string): void
  reorderFieldsInColumn(tabId: string, sectionId: string, columnId: string, fromIndex: number, toIndex: number): void
  moveField(args: MoveFieldArgs): boolean
  reset(): void
  replace(layout: FormLayout): void
  getUsedBranchIds(): Set<string>
  getAvailableBranches(): Branch[]
}

function makeColumn(id?: string): LayoutColumn {
  return { id: id ?? crypto.randomUUID(), fields: [] }
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

function wouldViolateFullWidthWithMap(
  section: LayoutSection,
  incomingBranch: Branch,
  branchMap: Map<string, Branch>,
  excludeColId?: string,
  excludeBranchId?: string,
): boolean {
  if (isFullWidthBranch(incomingBranch)) {
    return section.columns.some((c) => {
      const fieldsToCheck = (c.id === excludeColId && excludeBranchId)
        ? c.fields.filter((f) => f.branchId !== excludeBranchId)
        : c.fields
      return fieldsToCheck.length > 0
    })
  } else {
    return section.columns.some((c) =>
      c.fields.some((f) => {
        if (c.id === excludeColId && f.branchId === excludeBranchId) return false
        const b = branchMap.get(f.branchId)
        return b != null && isFullWidthBranch(b)
      })
    )
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

  // ── Tab ops ──────────────────────────────────────────────────────────────
  const addTab = useCallback(() => {
    mutate((d) => ({
      ...d,
      tabs: [...d.tabs, { id: crypto.randomUUID(), label: 'New Tab', sections: [makeSection(2)] } as LayoutTab],
    }))
  }, [mutate])

  const renameTab = useCallback((tabId: string, label: string) => {
    mutate((d) => ({ ...d, tabs: d.tabs.map((t) => (t.id === tabId ? { ...t, label } : t)) }))
  }, [mutate])

  const removeTab = useCallback((tabId: string) => {
    mutate((d) => {
      const remaining = d.tabs.filter((t) => t.id !== tabId)
      return { ...d, tabs: remaining.length > 0 ? remaining : d.tabs }
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

  // ── Section ops ──────────────────────────────────────────────────────────
  const addSection = useCallback((tabId: string, columnCount = 2) => {
    mutate((d) => ({
      ...d,
      tabs: d.tabs.map((t) =>
        t.id === tabId ? { ...t, sections: [...t.sections, makeSection(columnCount)] } : t
      ),
    }))
  }, [mutate])

  const removeSection = useCallback((tabId: string, sectionId: string) => {
    mutate((d) => ({
      ...d,
      tabs: d.tabs.map((t) =>
        t.id === tabId ? { ...t, sections: t.sections.filter((s) => s.id !== sectionId) } : t
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
            ? { ...t, sections: t.sections.map((s) => s.id === sectionId ? { ...s, [flag]: !s[flag] } : s) }
            : t
        ),
      }))
    }, [mutate])

  const renameSection = useCallback((tabId: string, sectionId: string, label: string | undefined) => {
    mutate((d) => ({
      ...d,
      tabs: d.tabs.map((t) =>
        t.id === tabId
          ? { ...t, sections: t.sections.map((s) => s.id === sectionId ? { ...s, label: label || undefined } : s) }
          : t
      ),
    }))
  }, [mutate])

  const setSectionColumnCount = useCallback((tabId: string, sectionId: string, n: 1 | 2 | 3 | 4) => {
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
              return { ...s, columns: [...current, ...Array.from({ length: n - current.length }, () => makeColumn())] }
            }
            if (n < current.length) return { ...s, columns: current.slice(0, n) }
            return s
          }),
        }
      }),
    }))
  }, [mutate])

  // ── Column ops ───────────────────────────────────────────────────────────
  const reorderColumns = useCallback((tabId: string, sectionId: string, fromIndex: number, toIndex: number) => {
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
  }, [mutate])

  // ── Field ops ────────────────────────────────────────────────────────────
  const assignField = useCallback(
    (tabId: string, sectionId: string, columnId: string, branchId: string): boolean => {
      const branch = branchMap.get(branchId)
      if (!branch) return false

      const tab = draft.tabs.find((t) => t.id === tabId)
      const section = tab?.sections.find((s) => s.id === sectionId)
      if (!section || wouldViolateFullWidthWithMap(section, branch, branchMap)) {
        return false
      }

      mutate((d) => ({
        ...d,
        tabs: d.tabs.map((t) =>
          t.id === tabId ? {
            ...t,
            sections: t.sections.map((s) =>
              s.id === sectionId ? {
                ...s,
                columns: s.columns.map((c) =>
                  c.id === columnId ? { ...c, fields: [...c.fields, { branchId }] } : c
                ),
              } : s
            ),
          } : t
        ),
      }))
      return true
    },
    [draft, mutate, branchMap]
  )

  const clearField = useCallback((tabId: string, sectionId: string, columnId: string, branchId: string) => {
    mutate((d) => ({
      ...d,
      tabs: d.tabs.map((t) =>
        t.id === tabId ? {
          ...t,
          sections: t.sections.map((s) =>
            s.id === sectionId ? {
              ...s,
              columns: s.columns.map((c) =>
                c.id === columnId ? { ...c, fields: c.fields.filter((f) => f.branchId !== branchId) } : c
              ),
            } : s
          ),
        } : t
      ),
    }))
  }, [mutate])

  const reorderFieldsInColumn = useCallback(
    (tabId: string, sectionId: string, columnId: string, fromIndex: number, toIndex: number) => {
      mutate((d) => ({
        ...d,
        tabs: d.tabs.map((t) => {
          if (t.id !== tabId) return t
          return {
            ...t,
            sections: t.sections.map((s) => {
              if (s.id !== sectionId) return s
              return {
                ...s,
                columns: s.columns.map((c) => {
                  if (c.id !== columnId) return c
                  const fields = [...c.fields]
                  const [moved] = fields.splice(fromIndex, 1)
                  fields.splice(toIndex, 0, moved)
                  return { ...c, fields }
                }),
              }
            }),
          }
        }),
      }))
    },
    [mutate]
  )

  const moveField = useCallback(
    ({ from, to }: MoveFieldArgs): boolean => {
      const branch = branchMap.get(from.branchId)
      if (!branch) return false

      const toTab = draft.tabs.find((t) => t.id === to.tabId)
      const toSection = toTab?.sections.find((s) => s.id === to.sectionId)
      if (!toSection || wouldViolateFullWidthWithMap(toSection, branch, branchMap)) {
        return false
      }

      mutate((d) => ({
        ...d,
        tabs: d.tabs.map((t) => ({
          ...t,
          sections: t.sections.map((s) => ({
            ...s,
            columns: s.columns.map((c) => {
              // Remove from source
              if (t.id === from.tabId && s.id === from.sectionId && c.id === from.columnId) {
                return { ...c, fields: c.fields.filter((f) => f.branchId !== from.branchId) }
              }
              // Append to destination
              if (t.id === to.tabId && s.id === to.sectionId && c.id === to.columnId) {
                return { ...c, fields: [...c.fields, { branchId: from.branchId }] }
              }
              return c
            }),
          })),
        })),
      }))
      return true
    },
    [draft, mutate, branchMap]
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
          for (const f of col.fields) ids.add(f.branchId)
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
    draft, activeTabId, setActiveTabId, isDirty,
    addTab, renameTab, removeTab, reorderTabs,
    addSection, removeSection, reorderSections, toggleSectionFlag, renameSection, setSectionColumnCount,
    reorderColumns,
    assignField, clearField, reorderFieldsInColumn, moveField,
    reset, replace, getUsedBranchIds, getAvailableBranches,
  }
}
