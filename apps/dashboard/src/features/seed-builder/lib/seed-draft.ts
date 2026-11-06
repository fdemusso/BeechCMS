// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Unsaved content type dialogs survive a page reload: while the dialog is open and edited, its form is kept in
 * localStorage (a cookie would travel with every request and is capped near 4 KB). One draft per scope: the create
 * dialog, or one per stored seed being edited. Closing or saving the dialog drops its draft.
 */

const PREFIX = "beech:seed-draft:v1:"
/** A draft left alone this long is stale: the schema it was written against has likely moved on. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export interface SeedDraft {
  formData: Record<string, unknown>
  step: string
  slugTouched: boolean
  savedAt: number
}

/** The storage key of a dialog: `null` is the create dialog, a slug is the edit dialog of that seed. */
export function draftKey(slug: string | null): string {
  return slug === null ? `${PREFIX}create` : `${PREFIX}edit:${slug}`
}

function isDraft(value: unknown): value is SeedDraft {
  if (typeof value !== "object" || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.formData === "object" && v.formData !== null && !Array.isArray(v.formData) &&
    typeof v.step === "string" &&
    typeof v.slugTouched === "boolean" &&
    typeof v.savedAt === "number"
  )
}

// Storage can be missing, blocked or full (private windows, quota): a draft is a convenience, never a requirement.
export function readDraft(key: string, now = Date.now()): SeedDraft | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isDraft(parsed) || now - parsed.savedAt > MAX_AGE_MS) {
      localStorage.removeItem(key)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function writeDraft(key: string, draft: Omit<SeedDraft, "savedAt">, now = Date.now()): void {
  try {
    localStorage.setItem(key, JSON.stringify({ ...draft, savedAt: now }))
  } catch {
    // Quota or blocked storage: the draft is simply not kept.
  }
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}

export function hasCreateDraft(): boolean {
  return readDraft(draftKey(null)) !== null
}

/** The slug of a stored seed whose edit dialog was left open, if any. */
export function findEditDraftSlug(): string | null {
  try {
    const editPrefix = `${PREFIX}edit:`
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(editPrefix) && readDraft(key) !== null) return key.slice(editPrefix.length)
    }
  } catch {
    // Storage unavailable.
  }
  return null
}
