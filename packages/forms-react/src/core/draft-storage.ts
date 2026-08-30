// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export function getDraftStorageKey(seedSlug: string): string {
  return `beech_form_draft_${seedSlug}`
}

export function saveFormDraft(seedSlug: string, values: Record<string, unknown>): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false
  try {
    const key = getDraftStorageKey(seedSlug)
    // Exclude file blobs and anti-bot internal properties from persistence
    const sanitized: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(values)) {
      if (k.startsWith('_') || k.startsWith('fax_number') || v instanceof File || (v && typeof v === 'object' && 'data' in v && 'mimeType' in v)) {
        continue
      }
      sanitized[k] = v
    }
    window.localStorage.setItem(key, JSON.stringify(sanitized))
    return true
  } catch {
    return false
  }
}

export function loadFormDraft<TValues extends Record<string, unknown>>(seedSlug: string): Partial<TValues> | null {
  if (typeof window === 'undefined' || !window.localStorage) return null
  try {
    const key = getDraftStorageKey(seedSlug)
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as Partial<TValues>
  } catch {
    return null
  }
}

export function clearFormDraft(seedSlug: string): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false
  try {
    window.localStorage.removeItem(getDraftStorageKey(seedSlug))
    return true
  } catch {
    return false
  }
}
