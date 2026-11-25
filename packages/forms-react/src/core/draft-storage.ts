// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

const DRAFT_KEY_PREFIX = 'beech_form_draft_'

/** Drafts left untouched for this long are discarded (sliding: every save renews it). */
export const DEFAULT_DRAFT_TTL_MS = 24 * 60 * 60 * 1000

export interface SaveFormDraftOptions {
  /** Field aliases that must never be written to storage. */
  exclude?: readonly string[]
  /** Lifetime of the draft, counted from `now`. */
  ttlMs?: number
  /** Clock override, epoch ms. */
  now?: number
}

interface StoredDraft {
  expiresAt: number
  values: Record<string, unknown>
}

export function getDraftStorageKey(seedSlug: string): string {
  return `${DRAFT_KEY_PREFIX}${seedSlug}`
}

/** Returns the draft if it is a live envelope; drafts without an expiry (legacy format) count as expired. */
function readLiveDraft(raw: string, now: number): StoredDraft | null {
  const parsed: unknown = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object') return null
  const { expiresAt, values } = parsed as Partial<StoredDraft>
  if (typeof expiresAt !== 'number' || expiresAt <= now) return null
  if (!values || typeof values !== 'object') return null
  return { expiresAt, values }
}

export function saveFormDraft(
  seedSlug: string,
  values: Record<string, unknown>,
  options: SaveFormDraftOptions = {}
): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false
  try {
    const { exclude = [], ttlMs = DEFAULT_DRAFT_TTL_MS, now = Date.now() } = options
    const excluded = new Set(exclude)
    const key = getDraftStorageKey(seedSlug)
    // Exclude file blobs and anti-bot internal properties from persistence
    const sanitized: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(values)) {
      if (excluded.has(k) || k.startsWith('_') || k.startsWith('fax_number') || v instanceof File || (v && typeof v === 'object' && 'data' in v && 'mimeType' in v)) {
        continue
      }
      sanitized[k] = v
    }
    const draft: StoredDraft = { expiresAt: now + ttlMs, values: sanitized }
    window.localStorage.setItem(key, JSON.stringify(draft))
    return true
  } catch {
    return false
  }
}

export function loadFormDraft<TValues extends Record<string, unknown>>(
  seedSlug: string,
  options: { now?: number } = {}
): Partial<TValues> | null {
  if (typeof window === 'undefined' || !window.localStorage) return null
  try {
    const key = getDraftStorageKey(seedSlug)
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const draft = readLiveDraft(raw, options.now ?? Date.now())
    if (!draft) {
      window.localStorage.removeItem(key)
      return null
    }
    return draft.values as Partial<TValues>
  } catch {
    return null
  }
}

/** Removes expired and legacy (no expiry) drafts of every form on this origin. */
export function purgeStaleFormDrafts(options: { now?: number } = {}): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    const now = options.now ?? Date.now()
    const keys: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (key?.startsWith(DRAFT_KEY_PREFIX)) keys.push(key)
    }
    for (const key of keys) {
      const raw = window.localStorage.getItem(key)
      let live = false
      try {
        live = raw !== null && readLiveDraft(raw, now) !== null
      } catch {
        live = false
      }
      if (!live) window.localStorage.removeItem(key)
    }
  } catch {
    // storage unavailable: nothing to purge
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
