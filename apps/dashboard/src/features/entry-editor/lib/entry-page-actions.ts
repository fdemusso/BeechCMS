// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { TFunction } from "i18next"
import { Check, Copy, Send, Trash2, Undo } from "@/components/icons"
// Module path, not the barrel: suites mock the barrel with a fixed object.
import type { PageAction, PageActionDeclaration } from "@/features/shared/hooks/use-page-actions"

/** Stable entry points into the editor's own handlers (brief rule 1); never re-created per render. */
export interface EntryPageActionHandlers {
  /** The submit button's path: draft save in draft context, live save otherwise. */
  readonly save: () => void
  readonly publishDraft: () => void
  /** Opens the editor's own discard confirmation, as the dropdown item and the banner button do. */
  readonly requestDiscardDraft: () => void
  /** Soft delete with the 5000 ms Undo toast, as the footer button does. */
  readonly remove: () => void
}

export interface EntryPageActionsInput {
  readonly t: TFunction
  readonly schemaSlug: string
  readonly entryId: string | undefined
  /** The dialog title, e.g. "Edit Post". */
  readonly title: string
  /** The form is on screen: seed loaded, entry loaded without error, layout builder closed. */
  readonly ready: boolean
  readonly isCreate: boolean
  readonly isDraftContext: boolean
  readonly effectiveDraftContext: boolean
  readonly hasSaveDropdown: boolean
  readonly hasPendingDraftNotice: boolean
  readonly hasRestrictedRefs: boolean
  readonly isReadOnly: boolean
  /** isBusy || isDeleting || isDiscarding: a mutation is in flight. */
  readonly isWorking: boolean
  readonly handlers: EntryPageActionHandlers
}

export const ENTRY_EDITOR_HOST_ID = "entry-editor"

function saveLabelKey({ effectiveDraftContext, isDraftContext, isCreate }: EntryPageActionsInput): string {
  if (effectiveDraftContext || (isDraftContext && isCreate)) return "content.editor.saveDraft"
  return isCreate ? "common.create" : "common.action.save"
}

/** What the editor offers the palette right now; null while the form is not on screen. Pure. */
export function buildEntryPageActions(input: EntryPageActionsInput): PageActionDeclaration | null {
  if (!input.ready) return null

  const { t, schemaSlug, entryId, title, isCreate, hasRestrictedRefs, isReadOnly, isWorking, handlers } = input
  const canMutate = !isReadOnly
  const busyReason = isWorking ? t("content.editor.busy") : undefined

  const actions: PageAction[] = []

  if (canMutate) {
    actions.push({
      id: "save",
      label: t(saveLabelKey(input)),
      icon: Check,
      requires: { permission: isCreate ? "content:create" : "content:update", scope: schemaSlug },
      unavailableReason: busyReason,
      perform: { kind: "run", run: handlers.save },
    })
  }

  if (canMutate && input.hasSaveDropdown) {
    actions.push({
      id: "publish-draft",
      label: t("content.editor.publishDraft"),
      icon: Send,
      requires: { permission: "content:update", scope: schemaSlug },
      unavailableReason: busyReason,
      confirm: {
        title: t("content.editor.publishConfirm.title"),
        description: t("content.editor.publishConfirmDesc"),
      },
      perform: { kind: "run", run: handlers.publishDraft },
    })
  }

  if (canMutate && (input.hasSaveDropdown || (!input.effectiveDraftContext && input.hasPendingDraftNotice))) {
    actions.push({
      id: "discard-draft",
      label: t("content.editor.discardDraft.label"),
      icon: Undo,
      requires: { permission: "content:update", scope: schemaSlug },
      unavailableReason: busyReason,
      perform: { kind: "run", run: handlers.requestDiscardDraft },
    })
  }

  if (canMutate && !isCreate && !input.effectiveDraftContext) {
    actions.push({
      id: "delete",
      label: t("common.action.delete"),
      icon: Trash2,
      requires: { permission: "content:delete", scope: schemaSlug },
      unavailableReason: hasRestrictedRefs ? t("backrefs.deleteBlocked", { count: "?" }) : busyReason,
      perform: { kind: "run", run: handlers.remove },
    })
  }

  if (!isCreate && entryId) {
    actions.push({
      id: "copy-id",
      label: t("content.actions.copyId"),
      icon: Copy,
      perform: { kind: "copy", value: entryId },
    })
  }

  return { hostId: ENTRY_EDITOR_HOST_ID, targetId: entryId ?? null, title, actions }
}
