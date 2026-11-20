// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { TFunction } from "i18next"
import { NoteAdd, Stickynote, Trash2 } from "@/components/icons"
import type { PaletteItem, PaletteProvider } from "../types"
import { EXACT_MATCH_SCORE } from "../lib/rank-palette-items"
import {
  noteTextRejection,
  QUICK_NOTE_MAX_LENGTH,
  QUICK_NOTES_MAX_COUNT,
  type QuickNote,
} from "../lib/quick-notes-storage"
import type { QuickNotesState } from "../use-quick-notes"

/** Quick notes: written and listed under the `#` prefix; existing notes also match un-prefixed queries. */
export function createQuickNotesProvider(deps: {
  t: TFunction
  notes: QuickNotesState
  save: (text: string) => void
  remove: (note: QuickNote) => void
  /** Relative "saved …" text for a note's createdAt (epoch ms). */
  formatSavedAt: (epochMs: number) => string
}): PaletteProvider {
  const { t, notes, save, remove, formatSavedAt } = deps
  const section = t("commandPalette.notes.section")

  const composeUnavailableReason = (query: string): string | undefined => {
    if (notes.status === "unavailable") return t("commandPalette.notes.unavailable")

    const rejection = noteTextRejection(query)
    if (rejection === "empty") return t("commandPalette.notes.typeToSave")
    if (rejection === "too-long") {
      return t("commandPalette.notes.tooLong", { length: query.length, max: QUICK_NOTE_MAX_LENGTH })
    }
    if (notes.notes.length >= QUICK_NOTES_MAX_COUNT) {
      return t("commandPalette.notes.full", { max: QUICK_NOTES_MAX_COUNT })
    }
    return undefined
  }

  const composeRow = (query: string): PaletteItem => ({
    id: "notes:new",
    section,
    label: query ? t("commandPalette.notes.save", { text: query }) : t("commandPalette.notes.compose"),
    description: t("commandPalette.notes.browserOnly"),
    icon: NoteAdd,
    score: EXACT_MATCH_SCORE,
    unavailableReason: composeUnavailableReason(query),
    perform: { kind: "run", run: () => save(query) },
  })

  const noteRow = (note: QuickNote): PaletteItem => ({
    id: `notes:${note.id}`,
    section,
    label: note.text,
    description: formatSavedAt(note.createdAt),
    icon: Stickynote,
    perform: { kind: "copy", value: note.text },
    actions: [
      {
        id: "delete",
        label: t("commandPalette.notes.delete"),
        icon: Trash2,
        destructive: true,
        perform: { kind: "run", run: () => remove(note) },
      },
    ],
  })

  return {
    id: "notes",
    pages: ["root"],
    prefix: "#",
    getItems: ({ query, prefix }) => {
      const noteRows = notes.status === "ready" ? notes.notes.map(noteRow) : []
      if (prefix === "#") return [composeRow(query), ...noteRows]
      return query ? noteRows : []
    },
  }
}
