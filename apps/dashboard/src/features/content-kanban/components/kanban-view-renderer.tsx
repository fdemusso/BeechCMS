// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { CardConfigDialog, type ViewDefinition, type ViewRendererProps } from "@/features/shared"
import { ContentKanban } from "./content-kanban"
import { KanbanSettingsSection } from "./kanban-settings-section"
import { useKanbanEntrySync } from "../hooks/use-kanban-entry-sync"
import { toActiveFilters } from "../utils/kanban-filter-mapping"

/** The Kanban View Type's renderer: hosts the board, its card-layout dialog and the entry-editor save sync. */
export function KanbanViewRenderer({ seed, slug, query, layout, formatElement, entries, isSaving, configDialog }: ViewRendererProps) {
  const kanbanSync = useKanbanEntrySync(seed, slug, layout.kanban.axisBranchId)
  const kanbanSyncRef = React.useRef(kanbanSync)

  React.useEffect(() => {
    kanbanSyncRef.current = kanbanSync
  }, [kanbanSync])

  React.useEffect(
    () => entries.subscribeSaved((info) => kanbanSyncRef.current(info)),
    [entries.subscribeSaved]
  )

  const activeFilters = React.useMemo(
    () => toActiveFilters(query.columnFilters, (query as { toolbarFilters?: Record<string, unknown> }).toolbarFilters),
    [query.columnFilters, (query as { toolbarFilters?: Record<string, unknown> }).toolbarFilters]
  )

  return (
    <>
      <ContentKanban
        seed={seed}
        seedSlug={slug}
        isLoading={query.isLoading}
        onEdit={entries.handleEdit}
        onCreateEntry={entries.handleCreate}
        search={query.debouncedSearch.trim() || undefined}
        activeFilters={activeFilters}
        kanbanConfig={layout.kanban}
        setKanbanConfig={layout.setKanban}
        cardConfig={layout.card}
        setCardConfig={layout.setCard}
        isSaving={isSaving}
        formatElement={formatElement}
      />
      <CardConfigDialog
        open={configDialog.open}
        onClose={() => configDialog.onOpenChange(false)}
        seed={seed}
        config={layout.card}
        onSave={layout.setCard}
      />
    </>
  )
}

export const KANBAN_VIEW_DEFINITION: ViewDefinition = {
  type: "kanban",
  labelKey: "content.list.kanban",
  enabledTools: ["filter", "search", "settings", "create", "transfer"],
  settings: ["conditionalFormats"],
  Renderer: KanbanViewRenderer,
  SettingsSection: KanbanSettingsSection,
}
