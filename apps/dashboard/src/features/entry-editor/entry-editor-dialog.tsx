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
}

export function EntryEditorDialog(props: Readonly<EntryEditorDialogProps>) {
  const { schemaSlug, entryId, isDraftContext, open, onClose, readonly } = props
  const vm = useEntryEditorDialog({ schemaSlug, entryId, isDraftContext, onClose, readonly })
  return <SchemaFormShell vm={vm} open={open} />
}
