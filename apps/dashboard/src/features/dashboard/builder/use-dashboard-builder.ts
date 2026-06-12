// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useCallback, useMemo, useState } from 'react'
import type {
  DashboardLayout,
  DashboardPageLayout,
  DashboardSection,
  DashboardColumn,
  DashboardWidgetInstance,
} from '@beechcms/core'
import { getWidgetDefinition } from '../registry/widget-registry'

export interface UseDashboardBuilderArgs {
  initialLayout: DashboardLayout
}

export interface MoveWidgetArgs {
  from: { pageId: string; sectionId: string; columnId: string; widgetId: string }
  to: { pageId: string; sectionId: string; columnId: string; index?: number }
}

export interface UseDashboardBuilderResult {
  draft: DashboardLayout
  activePageId: string
  setActivePageId: (id: string) => void
  isDirty: boolean

  addPage(): void
  renamePage(pageId: string, label: string): void
  removePage(pageId: string): void
  movePage(fromIndex: number, toIndex: number): void

  addSection(pageId: string, columnCount?: 1 | 2 | 3 | 4): void
  updateSection(
    pageId: string,
    sectionId: string,
    updates: Partial<Pick<DashboardSection, 'label' | 'hideLabel' | 'collapsible'>>,
  ): void
  removeSection(pageId: string, sectionId: string): void
  moveSection(pageId: string, fromIndex: number, toIndex: number): void
  duplicateSection(pageId: string, sectionId: string): void
  setColumnPreset(pageId: string, sectionId: string, spans: number[]): void

  addWidget(pageId: string, sectionId: string, columnId: string, type: string): void
  updateWidgetConfig(
    pageId: string,
    sectionId: string,
    columnId: string,
    widgetId: string,
    config: Record<string, unknown>,
  ): void
  updateWidgetTitle(
    pageId: string,
    sectionId: string,
    columnId: string,
    widgetId: string,
    title: string | undefined,
  ): void
  moveWidget(args: MoveWidgetArgs): boolean
  moveWidgetToPage(args: MoveWidgetArgs['from'], toPageId: string): boolean
  removeWidget(pageId: string, sectionId: string, columnId: string, widgetId: string): void
  replaceWidget(
    pageId: string,
    sectionId: string,
    columnId: string,
    widgetId: string,
    newType: string,
  ): void

  reset(): void
}

const COLUMN_PRESETS: ReadonlyArray<readonly number[]> = [
  [12],
  [6, 6],
  [8, 4],
  [4, 8],
  [4, 4, 4],
  [3, 3, 3, 3],
]

export { COLUMN_PRESETS }

function makeColumn(): DashboardColumn {
  return { id: crypto.randomUUID(), widgets: [] }
}

function makeSection(columnCount: 1 | 2 | 3 | 4 = 1): DashboardSection {
  const preset = COLUMN_PRESETS.find((p) => p.length === columnCount) ?? COLUMN_PRESETS[0]
  return {
    id: crypto.randomUUID(),
    columns: Array.from({ length: columnCount }, () => makeColumn()),
    columnSpans: [...preset],
  }
}

function makePage(label: string): DashboardPageLayout {
  const slug = `page-${crypto.randomUUID().slice(0, 8)}`
  return {
    id: crypto.randomUUID(),
    slug,
    label,
    sections: [makeSection(1)],
  }
}

export function useDashboardBuilder({ initialLayout }: UseDashboardBuilderArgs): UseDashboardBuilderResult {
  const [draft, setDraft] = useState<DashboardLayout>(() => structuredClone(initialLayout))
  const [storedInitial, setStoredInitial] = useState<DashboardLayout>(() => structuredClone(initialLayout))
  const [activePageId, setActivePageId] = useState<string>(() => initialLayout.pages[0]?.id ?? '')

  const isDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(storedInitial),
    [draft, storedInitial],
  )

  const mutate = useCallback((fn: (d: DashboardLayout) => DashboardLayout) => {
    setDraft((prev) => fn(structuredClone(prev)))
  }, [])

  // ── Page ops ─────────────────────────────────────────────────────────────
  const addPage = useCallback(() => {
    const page = makePage('New Page')
    mutate((d) => ({ ...d, pages: [...d.pages, page] }))
    setActivePageId(page.id)
  }, [mutate])

  const renamePage = useCallback((pageId: string, label: string) => {
    mutate((d) => ({ ...d, pages: d.pages.map((p) => (p.id === pageId ? { ...p, label } : p)) }))
  }, [mutate])

  const removePage = useCallback((pageId: string) => {
    mutate((d) => {
      if (d.pages.length <= 1) return d
      return { ...d, pages: d.pages.filter((p) => p.id !== pageId) }
    })
  }, [mutate])

  const movePage = useCallback((fromIndex: number, toIndex: number) => {
    mutate((d) => {
      const pages = [...d.pages]
      const [moved] = pages.splice(fromIndex, 1)
      pages.splice(toIndex, 0, moved)
      return { ...d, pages }
    })
  }, [mutate])

  // ── Section ops ──────────────────────────────────────────────────────────
  const addSection = useCallback((pageId: string, columnCount: 1 | 2 | 3 | 4 = 1) => {
    mutate((d) => ({
      ...d,
      pages: d.pages.map((p) =>
        p.id === pageId ? { ...p, sections: [...p.sections, makeSection(columnCount)] } : p,
      ),
    }))
  }, [mutate])

  const updateSection = useCallback(
    (
      pageId: string,
      sectionId: string,
      updates: Partial<Pick<DashboardSection, 'label' | 'hideLabel' | 'collapsible'>>,
    ) => {
      mutate((d) => ({
        ...d,
        pages: d.pages.map((p) =>
          p.id === pageId
            ? { ...p, sections: p.sections.map((s) => (s.id === sectionId ? { ...s, ...updates } : s)) }
            : p,
        ),
      }))
    },
    [mutate],
  )

  const removeSection = useCallback((pageId: string, sectionId: string) => {
    mutate((d) => ({
      ...d,
      pages: d.pages.map((p) =>
        p.id === pageId ? { ...p, sections: p.sections.filter((s) => s.id !== sectionId) } : p,
      ),
    }))
  }, [mutate])

  const moveSection = useCallback((pageId: string, fromIndex: number, toIndex: number) => {
    mutate((d) => ({
      ...d,
      pages: d.pages.map((p) => {
        if (p.id !== pageId) return p
        const sections = [...p.sections]
        const [moved] = sections.splice(fromIndex, 1)
        sections.splice(toIndex, 0, moved)
        return { ...p, sections }
      }),
    }))
  }, [mutate])

  const duplicateSection = useCallback((pageId: string, sectionId: string) => {
    mutate((d) => ({
      ...d,
      pages: d.pages.map((p) => {
        if (p.id !== pageId) return p
        const idx = p.sections.findIndex((s) => s.id === sectionId)
        if (idx === -1) return p
        const clone = structuredClone(p.sections[idx])
        clone.id = crypto.randomUUID()
        for (const col of clone.columns) {
          col.id = crypto.randomUUID()
          for (const w of col.widgets) w.id = crypto.randomUUID()
        }
        const sections = [...p.sections]
        sections.splice(idx + 1, 0, clone)
        return { ...p, sections }
      }),
    }))
  }, [mutate])

  // ── Column preset (with shrink rule) ────────────────────────────────────
  const setColumnPreset = useCallback((pageId: string, sectionId: string, spans: number[]) => {
    mutate((d) => ({
      ...d,
      pages: d.pages.map((p) => {
        if (p.id !== pageId) return p
        return {
          ...p,
          sections: p.sections.map((s) => {
            if (s.id !== sectionId) return s
            const targetCount = spans.length
            const current = s.columns
            let columns: DashboardColumn[]
            if (targetCount >= current.length) {
              columns = [...current, ...Array.from({ length: targetCount - current.length }, () => makeColumn())]
            } else {
              const kept = current.slice(0, targetCount)
              const overflow = current.slice(targetCount).flatMap((c) => c.widgets)
              const last = kept[kept.length - 1]
              kept[kept.length - 1] = { ...last, widgets: [...last.widgets, ...overflow] }
              columns = kept
            }
            return { ...s, columns, columnSpans: [...spans] }
          }),
        }
      }),
    }))
  }, [mutate])

  // ── Widget ops ───────────────────────────────────────────────────────────
  const addWidget = useCallback((pageId: string, sectionId: string, columnId: string, type: string) => {
    const def = getWidgetDefinition(type)
    const instance: DashboardWidgetInstance = {
      id: crypto.randomUUID(),
      type,
      config: structuredClone(def?.defaultConfig ?? {}) as Record<string, unknown>,
    }
    mutate((d) => ({
      ...d,
      pages: d.pages.map((p) =>
        p.id === pageId
          ? {
              ...p,
              sections: p.sections.map((s) =>
                s.id === sectionId
                  ? {
                      ...s,
                      columns: s.columns.map((c) =>
                        c.id === columnId ? { ...c, widgets: [...c.widgets, instance] } : c,
                      ),
                    }
                  : s,
              ),
            }
          : p,
      ),
    }))
  }, [mutate])

  const updateWidgetConfig = useCallback(
    (pageId: string, sectionId: string, columnId: string, widgetId: string, config: Record<string, unknown>) => {
      mutate((d) => ({
        ...d,
        pages: d.pages.map((p) =>
          p.id === pageId
            ? {
                ...p,
                sections: p.sections.map((s) =>
                  s.id === sectionId
                    ? {
                        ...s,
                        columns: s.columns.map((c) =>
                          c.id === columnId
                            ? {
                                ...c,
                                widgets: c.widgets.map((w) => (w.id === widgetId ? { ...w, config } : w)),
                              }
                            : c,
                        ),
                      }
                    : s,
                ),
              }
            : p,
        ),
      }))
    },
    [mutate],
  )

  const updateWidgetTitle = useCallback(
    (pageId: string, sectionId: string, columnId: string, widgetId: string, title: string | undefined) => {
      mutate((d) => ({
        ...d,
        pages: d.pages.map((p) =>
          p.id === pageId
            ? {
                ...p,
                sections: p.sections.map((s) =>
                  s.id === sectionId
                    ? {
                        ...s,
                        columns: s.columns.map((c) =>
                          c.id === columnId
                            ? {
                                ...c,
                                widgets: c.widgets.map((w) =>
                                  w.id === widgetId ? { ...w, title: title || undefined } : w,
                                ),
                              }
                            : c,
                        ),
                      }
                    : s,
                ),
              }
            : p,
        ),
      }))
    },
    [mutate],
  )

  const moveWidget = useCallback(({ from, to }: MoveWidgetArgs): boolean => {
    let moved: DashboardWidgetInstance | undefined
    let ok = false

    mutate((d) => {
      const fromPage = d.pages.find((p) => p.id === from.pageId)
      const fromSection = fromPage?.sections.find((s) => s.id === from.sectionId)
      const fromColumn = fromSection?.columns.find((c) => c.id === from.columnId)
      const toPage = d.pages.find((p) => p.id === to.pageId)
      const toSection = toPage?.sections.find((s) => s.id === to.sectionId)
      const toColumn = toSection?.columns.find((c) => c.id === to.columnId)
      if (!fromColumn || !toColumn) return d

      const widgetIdx = fromColumn.widgets.findIndex((w) => w.id === from.widgetId)
      if (widgetIdx === -1) return d
      moved = fromColumn.widgets[widgetIdx]

      return {
        ...d,
        pages: d.pages.map((p) => ({
          ...p,
          sections: p.sections.map((s) => ({
            ...s,
            columns: s.columns.map((c) => {
              let widgets = c.widgets
              if (c.id === from.columnId && s.id === from.sectionId && p.id === from.pageId) {
                widgets = widgets.filter((w) => w.id !== from.widgetId)
              }
              if (c.id === to.columnId && s.id === to.sectionId && p.id === to.pageId && moved) {
                const sameColumn = from.columnId === to.columnId && from.sectionId === to.sectionId && from.pageId === to.pageId
                const insertAt = to.index ?? widgets.length
                const next = [...widgets]
                if (sameColumn) {
                  // widgets already had the item filtered out above when same column
                }
                next.splice(Math.min(insertAt, next.length), 0, moved)
                widgets = next
              }
              return { ...c, widgets }
            }),
          })),
        })),
      }
    })

    ok = moved !== undefined
    return ok
  }, [mutate])

  const moveWidgetToPage = useCallback(
    (from: MoveWidgetArgs['from'], toPageId: string): boolean => {
      let ok = false
      mutate((d) => {
        const toPage = d.pages.find((p) => p.id === toPageId)
        const targetColumn = toPage?.sections[0]?.columns[0]
        if (!targetColumn) return d

        const fromPage = d.pages.find((p) => p.id === from.pageId)
        const fromSection = fromPage?.sections.find((s) => s.id === from.sectionId)
        const fromColumn = fromSection?.columns.find((c) => c.id === from.columnId)
        const widget = fromColumn?.widgets.find((w) => w.id === from.widgetId)
        if (!widget) return d
        ok = true

        return {
          ...d,
          pages: d.pages.map((p) => {
            if (p.id === from.pageId) {
              return {
                ...p,
                sections: p.sections.map((s) =>
                  s.id === from.sectionId
                    ? {
                        ...s,
                        columns: s.columns.map((c) =>
                          c.id === from.columnId
                            ? { ...c, widgets: c.widgets.filter((w) => w.id !== from.widgetId) }
                            : c,
                        ),
                      }
                    : s,
                ),
              }
            }
            if (p.id === toPageId) {
              return {
                ...p,
                sections: p.sections.map((s, sIdx) =>
                  sIdx === 0
                    ? {
                        ...s,
                        columns: s.columns.map((c, cIdx) =>
                          cIdx === 0 ? { ...c, widgets: [...c.widgets, widget] } : c,
                        ),
                      }
                    : s,
                ),
              }
            }
            return p
          }),
        }
      })
      return ok
    },
    [mutate],
  )

  const removeWidget = useCallback((pageId: string, sectionId: string, columnId: string, widgetId: string) => {
    mutate((d) => ({
      ...d,
      pages: d.pages.map((p) =>
        p.id === pageId
          ? {
              ...p,
              sections: p.sections.map((s) =>
                s.id === sectionId
                  ? {
                      ...s,
                      columns: s.columns.map((c) =>
                        c.id === columnId ? { ...c, widgets: c.widgets.filter((w) => w.id !== widgetId) } : c,
                      ),
                    }
                  : s,
              ),
            }
          : p,
      ),
    }))
  }, [mutate])

  const replaceWidget = useCallback(
    (pageId: string, sectionId: string, columnId: string, widgetId: string, newType: string) => {
      const def = getWidgetDefinition(newType)
      mutate((d) => ({
        ...d,
        pages: d.pages.map((p) =>
          p.id === pageId
            ? {
                ...p,
                sections: p.sections.map((s) =>
                  s.id === sectionId
                    ? {
                        ...s,
                        columns: s.columns.map((c) =>
                          c.id === columnId
                            ? {
                                ...c,
                                widgets: c.widgets.map((w) =>
                                  w.id === widgetId
                                    ? {
                                        ...w,
                                        type: newType,
                                        config: structuredClone(def?.defaultConfig ?? {}) as Record<string, unknown>,
                                      }
                                    : w,
                                ),
                              }
                            : c,
                        ),
                      }
                    : s,
                ),
              }
            : p,
        ),
      }))
    },
    [mutate],
  )

  const reset = useCallback(() => {
    setDraft(structuredClone(initialLayout))
    setStoredInitial(structuredClone(initialLayout))
    setActivePageId(initialLayout.pages[0]?.id ?? '')
  }, [initialLayout])

  return {
    draft,
    activePageId,
    setActivePageId,
    isDirty,
    addPage,
    renamePage,
    removePage,
    movePage,
    addSection,
    updateSection,
    removeSection,
    moveSection,
    duplicateSection,
    setColumnPreset,
    addWidget,
    updateWidgetConfig,
    updateWidgetTitle,
    moveWidget,
    moveWidgetToPage,
    removeWidget,
    replaceWidget,
    reset,
  }
}
