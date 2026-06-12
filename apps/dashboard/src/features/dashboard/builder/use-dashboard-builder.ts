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

export type DashboardColumnCount = 1 | 2 | 3 | 4

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

  addSection(pageId: string, columnCount?: DashboardColumnCount): void
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

function makeSection(columnCount: DashboardColumnCount = 1): DashboardSection {
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
  const addSection = useCallback((pageId: string, columnCount: DashboardColumnCount = 1) => {
    mutate((d) => {
      const page = d.pages.find((p) => p.id === pageId)
      if (page) {
        page.sections.push(makeSection(columnCount))
      }
      return d
    })
  }, [mutate])

  const updateSection = useCallback(
    (
      pageId: string,
      sectionId: string,
      updates: Partial<Pick<DashboardSection, 'label' | 'hideLabel' | 'collapsible'>>,
    ) => {
      mutate((d) => {
        const page = d.pages.find((p) => p.id === pageId)
        const section = page?.sections.find((s) => s.id === sectionId)
        if (section) {
          Object.assign(section, updates)
        }
        return d
      })
    },
    [mutate],
  )

  const removeSection = useCallback((pageId: string, sectionId: string) => {
    mutate((d) => {
      const page = d.pages.find((p) => p.id === pageId)
      if (page) {
        page.sections = page.sections.filter((s) => s.id !== sectionId)
      }
      return d
    })
  }, [mutate])

  const moveSection = useCallback((pageId: string, fromIndex: number, toIndex: number) => {
    mutate((d) => {
      const page = d.pages.find((p) => p.id === pageId)
      if (page) {
        const [moved] = page.sections.splice(fromIndex, 1)
        page.sections.splice(toIndex, 0, moved)
      }
      return d
    })
  }, [mutate])

  const duplicateSection = useCallback((pageId: string, sectionId: string) => {
    mutate((d) => {
      const page = d.pages.find((p) => p.id === pageId)
      if (page) {
        const idx = page.sections.findIndex((s) => s.id === sectionId)
        if (idx !== -1) {
          const clone = structuredClone(page.sections[idx])
          clone.id = crypto.randomUUID()
          for (const col of clone.columns) {
            col.id = crypto.randomUUID()
            for (const w of col.widgets) w.id = crypto.randomUUID()
          }
          page.sections.splice(idx + 1, 0, clone)
        }
      }
      return d
    })
  }, [mutate])

  // ── Column preset (with shrink rule) ────────────────────────────────────
  const setColumnPreset = useCallback((pageId: string, sectionId: string, spans: number[]) => {
    mutate((d) => {
      const page = d.pages.find((p) => p.id === pageId)
      const section = page?.sections.find((s) => s.id === sectionId)
      if (section) {
        const targetCount = spans.length
        const current = section.columns
        if (targetCount >= current.length) {
          section.columns = [
            ...current,
            ...Array.from({ length: targetCount - current.length }, () => makeColumn()),
          ]
        } else {
          const kept = current.slice(0, targetCount)
          const overflow = current.slice(targetCount).flatMap((c) => c.widgets)
          const last = kept[kept.length - 1]
          kept[kept.length - 1] = { ...last, widgets: [...last.widgets, ...overflow] }
          section.columns = kept
        }
        section.columnSpans = [...spans]
      }
      return d
    })
  }, [mutate])

  // ── Widget ops ───────────────────────────────────────────────────────────
  const addWidget = useCallback((pageId: string, sectionId: string, columnId: string, type: string) => {
    const def = getWidgetDefinition(type)
    const instance: DashboardWidgetInstance = {
      id: crypto.randomUUID(),
      type,
      config: structuredClone(def?.defaultConfig ?? {}) as Record<string, unknown>,
    }
    mutate((d) => {
      const page = d.pages.find((p) => p.id === pageId)
      const section = page?.sections.find((s) => s.id === sectionId)
      const column = section?.columns.find((c) => c.id === columnId)
      if (column) {
        column.widgets.push(instance)
      }
      return d
    })
  }, [mutate])

  const updateWidgetConfig = useCallback(
    (pageId: string, sectionId: string, columnId: string, widgetId: string, config: Record<string, unknown>) => {
      mutate((d) => {
        const page = d.pages.find((p) => p.id === pageId)
        const section = page?.sections.find((s) => s.id === sectionId)
        const column = section?.columns.find((c) => c.id === columnId)
        const widget = column?.widgets.find((w) => w.id === widgetId)
        if (widget) {
          widget.config = config
        }
        return d
      })
    },
    [mutate],
  )

  const updateWidgetTitle = useCallback(
    (pageId: string, sectionId: string, columnId: string, widgetId: string, title: string | undefined) => {
      mutate((d) => {
        const page = d.pages.find((p) => p.id === pageId)
        const section = page?.sections.find((s) => s.id === sectionId)
        const column = section?.columns.find((c) => c.id === columnId)
        const widget = column?.widgets.find((w) => w.id === widgetId)
        if (widget) {
          widget.title = title || undefined
        }
        return d
      })
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
      if (fromColumn && toColumn) {
        const widgetIdx = fromColumn.widgets.findIndex((w) => w.id === from.widgetId)
        if (widgetIdx !== -1) {
          moved = fromColumn.widgets[widgetIdx]

          // Remove from old location
          fromColumn.widgets.splice(widgetIdx, 1)

          // Insert into new location
          const insertAt = to.index ?? toColumn.widgets.length
          toColumn.widgets.splice(Math.min(insertAt, toColumn.widgets.length), 0, moved)
        }
      }
      return d
    })

    ok = moved !== undefined
    return ok
  }, [mutate])

  const moveWidgetToPage = useCallback(
    (from: MoveWidgetArgs['from'], toPageId: string): boolean => {
      let ok = false
      mutate((d) => {
        const fromPage = d.pages.find((p) => p.id === from.pageId)
        const fromSection = fromPage?.sections.find((s) => s.id === from.sectionId)
        const fromColumn = fromSection?.columns.find((c) => c.id === from.columnId)
        if (fromColumn) {
          const widgetIdx = fromColumn.widgets.findIndex((w) => w.id === from.widgetId)
          if (widgetIdx !== -1) {
            const toPage = d.pages.find((p) => p.id === toPageId)
            const targetColumn = toPage?.sections[0]?.columns[0]
            if (targetColumn) {
              const [widget] = fromColumn.widgets.splice(widgetIdx, 1)
              targetColumn.widgets.push(widget)
              ok = true
            }
          }
        }
        return d
      })
      return ok
    },
    [mutate],
  )

  const removeWidget = useCallback((pageId: string, sectionId: string, columnId: string, widgetId: string) => {
    mutate((d) => {
      const page = d.pages.find((p) => p.id === pageId)
      const section = page?.sections.find((s) => s.id === sectionId)
      const column = section?.columns.find((c) => c.id === columnId)
      if (column) {
        column.widgets = column.widgets.filter((w) => w.id !== widgetId)
      }
      return d
    })
  }, [mutate])

  const replaceWidget = useCallback(
    (pageId: string, sectionId: string, columnId: string, widgetId: string, newType: string) => {
      const def = getWidgetDefinition(newType)
      mutate((d) => {
        const page = d.pages.find((p) => p.id === pageId)
        const section = page?.sections.find((s) => s.id === sectionId)
        const column = section?.columns.find((c) => c.id === columnId)
        const widget = column?.widgets.find((w) => w.id === widgetId)
        if (widget) {
          widget.type = newType
          widget.config = structuredClone(def?.defaultConfig ?? {}) as Record<string, unknown>
        }
        return d
      })
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
