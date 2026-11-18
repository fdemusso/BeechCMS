// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
import { toast } from "sonner"
import { probePaletteStorage } from "./lib/palette-storage"
import {
  deleteNote,
  insertNote,
  QUICK_NOTE_MAX_LENGTH,
  QUICK_NOTES_MAX_COUNT,
  readNotes,
  type QuickNote,
  type QuickNotesRejection,
} from "./lib/quick-notes-storage"

/** Lifetime of the delete "Undo" toast (design contract, "Deleting"). */
const NOTE_UNDO_TOAST_MS = 5000

/** Notes together with the user they were read for. */
interface OwnedNotes {
  readonly userId: string | undefined
  readonly notes: readonly QuickNote[]
}

const NO_NOTES: readonly QuickNote[] = []

export type QuickNotesState =
  | { readonly status: "ready"; readonly notes: readonly QuickNote[] }
  | { readonly status: "unavailable" }

export interface QuickNotesApi {
  readonly state: QuickNotesState
  /** Saves `text` (trimmed) as a new note, then toasts the outcome. */
  readonly save: (text: string) => void
  /** Deletes `note` at once, then toasts with an Undo action. */
  readonly remove: (note: QuickNote) => void
}

function rejectionMessage(t: TFunction, reason: QuickNotesRejection, textLength: number): string {
  switch (reason) {
    case "empty":
      return t("commandPalette.notes.typeToSave")
    case "too-long":
      return t("commandPalette.notes.tooLong", { length: textLength, max: QUICK_NOTE_MAX_LENGTH })
    case "full":
      return t("commandPalette.notes.full", { max: QUICK_NOTES_MAX_COUNT })
    case "write-failed":
      return t("commandPalette.notes.saveFailed")
  }
}

/** Browser-only notes of `userId`, re-read from storage each time `open` turns true. */
export function useQuickNotes(userId: string | undefined, open: boolean): QuickNotesApi {
  const { t } = useTranslation()
  const [storage] = React.useState(probePaletteStorage)
  const [owned, setOwned] = React.useState<OwnedNotes>({ userId: undefined, notes: NO_NOTES })
  // Notes of another user are never exposed, even for the render before the effect re-reads storage.
  const notes = owned.userId === userId ? owned.notes : NO_NOTES

  React.useEffect(() => {
    if (open && storage && userId) setOwned({ userId, notes: readNotes(storage, userId) })
  }, [open, storage, userId])

  const state = React.useMemo<QuickNotesState>(
    () => (storage && userId ? { status: "ready", notes } : { status: "unavailable" }),
    [storage, userId, notes],
  )

  const save = React.useCallback(
    (text: string) => {
      if (!storage || !userId) return
      const trimmed = text.trim()
      const result = insertNote(storage, userId, { id: crypto.randomUUID(), text: trimmed, createdAt: Date.now() })
      if (result.ok) {
        setOwned({ userId, notes: result.notes })
        toast.success(t("commandPalette.notes.saved"))
      } else {
        toast.error(rejectionMessage(t, result.reason, trimmed.length))
      }
    },
    [storage, userId, t],
  )

  const remove = React.useCallback(
    (note: QuickNote) => {
      if (!storage || !userId) return
      const result = deleteNote(storage, userId, note.id)
      if (!result.ok) {
        toast.error(t("commandPalette.notes.deleteFailed"))
        return
      }
      setOwned({ userId, notes: result.notes })
      toast.success(t("commandPalette.notes.deleted"), {
        duration: NOTE_UNDO_TOAST_MS,
        // `.undo-toast` (index.css) draws the countdown bar and styles the action like our outline Button.
        className: "undo-toast",
        style: { "--undo-duration": `${NOTE_UNDO_TOAST_MS}ms` } as React.CSSProperties,
        action: {
          label: t("commandPalette.notes.undo"),
          onClick: () => {
            // Same note object: same id and createdAt, so it returns to its place.
            const restored = insertNote(storage, userId, note)
            if (restored.ok) {
              setOwned({ userId, notes: restored.notes })
              toast.success(t("commandPalette.notes.restored"))
            } else {
              toast.error(rejectionMessage(t, restored.reason, note.text.length))
            }
          },
        },
      })
    },
    [storage, userId, t],
  )

  return { state, save, remove }
}
