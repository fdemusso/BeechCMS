// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import { useEntryEditorDialog } from "./hooks/use-entry-editor-dialog"
import { SchemaFormShell } from "./renderer/schema-form-shell"

export interface EntryEditorDialogProps {
  schemaSlug: string
  entryId: string | undefined
  isDraftContext: boolean
  open: boolean
  onClose: () => void
  readonly?: boolean
  onSaved?: (info: { entryId?: string; data: Record<string, unknown>; isCreate: boolean }) => void
  /** Pre-seed values for CREATE mode (e.g. kanban column axis value). Ignored in edit mode. */
  defaultValues?: Record<string, unknown>
}

export function EntryEditorDialog(props: Readonly<EntryEditorDialogProps>) {
  const { schemaSlug, entryId, isDraftContext, open, onClose, readonly, onSaved, defaultValues } = props
  const vm = useEntryEditorDialog({ schemaSlug, entryId, isDraftContext, onClose, readonly, onSaved, defaultValues })
  return <SchemaFormShell vm={vm} open={open} />
}
