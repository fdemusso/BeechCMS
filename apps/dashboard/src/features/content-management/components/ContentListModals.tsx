// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Seed } from "@beechcms/core"
import { EntryEditorDialog } from "@/features/entry-editor"
import { ContentDeleteDialog } from "@/features/content-delete-dialog"
import { BulkEditDialog } from "@/features/bulk-edit"
import { CardConfigDialog } from "@/features/content-kanban"
import { AutomationPanel } from "@/features/automations"

export interface ContentListModalsProps {
  seed: Seed
  slug: string | undefined
  activeViewId: string
  cardConfigOpen: boolean
  onCloseCardConfig: () => void
  cardConfig: any
  onSaveCardConfig: (config: any) => void
  deleteDialogOpen: boolean
  onOpenChangeDelete: (open: boolean) => void
  entryIdsToDelete: string[] | null
  onConfirmDelete: () => Promise<void>
  bulkEditOpen: boolean
  onOpenChangeBulkEdit: (open: boolean) => void
  selectedIds: string[]
  automationPanelOpen: boolean
  onOpenChangeAutomation: (open: boolean) => void
  target: { schemaSlug: string; entryId: string | undefined; isDraftContext: boolean } | null
  dialogOpen: boolean
  onCloseEntryEditor: () => void
  createDefaults?: Record<string, unknown>
  readonly: boolean
  onSaved?: (info: any) => void
}

export function ContentListModals({
  seed,
  slug,
  activeViewId,
  cardConfigOpen,
  onCloseCardConfig,
  cardConfig,
  onSaveCardConfig,
  deleteDialogOpen,
  onOpenChangeDelete,
  entryIdsToDelete,
  onConfirmDelete,
  bulkEditOpen,
  onOpenChangeBulkEdit,
  selectedIds,
  automationPanelOpen,
  onOpenChangeAutomation,
  target,
  dialogOpen,
  onCloseEntryEditor,
  createDefaults,
  readonly,
  onSaved,
}: ContentListModalsProps) {
  return (
    <>
      {slug && activeViewId === "kanban" && (
        <CardConfigDialog
          open={cardConfigOpen}
          onClose={onCloseCardConfig}
          seed={seed}
          config={cardConfig}
          onSave={onSaveCardConfig}
        />
      )}

      {/* Modal Delete */}
      <ContentDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={onOpenChangeDelete}
        seed={seed}
        entryIds={entryIdsToDelete}
        onConfirm={onConfirmDelete}
      />

      {/* Modal Bulk Edit */}
      <BulkEditDialog
        open={bulkEditOpen}
        onOpenChange={onOpenChangeBulkEdit}
        seed={seed}
        selectedIds={selectedIds}
      />

      <AutomationPanel
        open={automationPanelOpen}
        onOpenChange={onOpenChangeAutomation}
        seedSlug={seed.slug}
        seedDisplayName={seed.label}
        seedBranches={seed.branches}
      />

      {target && (
        <EntryEditorDialog
          schemaSlug={target.schemaSlug}
          entryId={target.entryId}
          isDraftContext={target.isDraftContext}
          open={dialogOpen}
          onClose={onCloseEntryEditor}
          defaultValues={createDefaults}
          readonly={readonly}
          onSaved={onSaved}
        />
      )}
    </>
  )
}
