// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { PaletteStorage } from "./palette-storage"

export interface QuickNote {
  /** UUIDv4 minted by the caller. */
  readonly id: string
  /** Trimmed, non-empty, at most QUICK_NOTE_MAX_LENGTH UTF-16 units. */
  readonly text: string
  /** Epoch milliseconds; notes are listed newest first. */
  readonly createdAt: number
}

/** Count and length caps, so the notes never exhaust the browser quota (brief §4). */
export const QUICK_NOTES_MAX_COUNT = 50
export const QUICK_NOTE_MAX_LENGTH = 280

const KEY_PREFIX = "beech:quick-notes:v1:"

export type QuickNoteTextRejection = "empty" | "too-long"
export type QuickNotesRejection = QuickNoteTextRejection | "full" | "write-failed"

export type QuickNotesWrite =
  | { readonly ok: true; readonly notes: readonly QuickNote[] }
  | { readonly ok: false; readonly reason: QuickNotesRejection }

/** One storage key per user: another account on the same browser never reads these notes. */
export function quickNotesKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`
}

/** Why `text` (already trimmed) cannot be a note; null when it can. */
export function noteTextRejection(text: string): QuickNoteTextRejection | null {
  if (text === "") return "empty"
  if (text.length > QUICK_NOTE_MAX_LENGTH) return "too-long"
  return null
}

function isQuickNote(value: unknown): value is QuickNote {
  if (typeof value !== "object" || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.id === "string" && typeof v.text === "string" && typeof v.createdAt === "number"
}

function newestFirst(notes: readonly QuickNote[]): QuickNote[] {
  return [...notes].sort((a, b) => b.createdAt - a.createdAt)
}

/** The user's notes, newest first. A missing key, corrupt JSON or a failing read yields []. Never throws. */
export function readNotes(storage: PaletteStorage, userId: string): QuickNote[] {
  try {
    const raw = storage.getItem(quickNotesKey(userId))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return newestFirst(parsed.filter(isQuickNote))
  } catch {
    return []
  }
}

function writeNotes(storage: PaletteStorage, userId: string, notes: readonly QuickNote[]): QuickNotesWrite {
  const ordered = newestFirst(notes)
  try {
    storage.setItem(quickNotesKey(userId), JSON.stringify(ordered))
    return { ok: true, notes: ordered }
  } catch {
    return { ok: false, reason: "write-failed" }
  }
}

/** Read-modify-write: adds `note` unless rejected. Never throws. */
export function insertNote(storage: PaletteStorage, userId: string, note: QuickNote): QuickNotesWrite {
  const textRejection = noteTextRejection(note.text)
  if (textRejection) return { ok: false, reason: textRejection }

  const stored = readNotes(storage, userId)
  if (stored.some((existing) => existing.id === note.id)) return { ok: true, notes: stored }
  if (stored.length >= QUICK_NOTES_MAX_COUNT) return { ok: false, reason: "full" }

  return writeNotes(storage, userId, [...stored, note])
}

/** Read-modify-write: removes the note with `noteId`. Never throws. */
export function deleteNote(storage: PaletteStorage, userId: string, noteId: string): QuickNotesWrite {
  const stored = readNotes(storage, userId)
  if (!stored.some((note) => note.id === noteId)) return { ok: true, notes: stored }

  return writeNotes(
    storage,
    userId,
    stored.filter((note) => note.id !== noteId),
  )
}
