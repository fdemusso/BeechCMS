// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import type { FormLayout, Seed } from '@beechcms/core'

/**
 * Unsaved layout-builder work, kept so that a page reload picks up where it left off. One draft per seed.
 *
 * It lives in `sessionStorage`: it survives a reload of the tab and nothing else. Leaving the builder on
 * purpose (cancel, close, save) is not an interruption and removes the draft, so a draft that exists when
 * the page loads means the work was cut short by the reload. It never reaches the server until saved.
 *
 * Every read and write is guarded: storage can be blocked or full, and the builder must work exactly as
 * before when it is.
 */

const KEY_PREFIX = 'beechcms.layoutDraft.'
const VERSION = 1

export interface LayoutDraft {
  /** Fingerprint of the layout stored on the server when the draft was made. */
  readonly base: string
  /** The layout the builder compares against to tell what is unsaved (its `isDirty` baseline). */
  readonly saved: FormLayout
  /** The work in progress. */
  readonly layout: FormLayout
}

export type LayoutDraftLookup =
  | { readonly status: 'none' }
  /** A draft exists but the server layout moved on since, so applying it could overwrite newer work. */
  | { readonly status: 'stale' }
  | { readonly status: 'ready'; readonly draft: LayoutDraft }

/**
 * A short, stable digest of a layout (djb2 over its JSON). `undefined` and `null` — a seed with no stored
 * layout — share one value, because the default layout a missing one generates carries fresh random ids on
 * every load and could never be compared.
 */
export function fingerprintLayout(layout: FormLayout | null | undefined): string {
  const json = JSON.stringify(layout ?? null)
  let hash = 5381
  for (let index = 0; index < json.length; index += 1) {
    hash = ((hash << 5) + hash + json.charCodeAt(index)) | 0
  }
  return `${json.length}:${(hash >>> 0).toString(36)}`
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Structural check only. A draft is work in progress and may break rules the saved layout must keep (a tab
 * with no section yet, say); the strict schema would throw exactly that work away.
 */
function isLayoutShape(value: unknown): value is FormLayout {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.tabs)) return false
  return value.tabs.every(
    (tab) =>
      isRecord(tab) &&
      typeof tab.id === 'string' &&
      typeof tab.label === 'string' &&
      Array.isArray(tab.sections) &&
      tab.sections.every(
        (section) =>
          isRecord(section) &&
          typeof section.id === 'string' &&
          Array.isArray(section.columns) &&
          section.columns.every(
            (column) => isRecord(column) && typeof column.id === 'string' && Array.isArray(column.fields),
          ),
      ),
  )
}

function parseDraft(raw: string | null): LayoutDraft | null {
  if (!raw) return null
  try {
    const data: unknown = JSON.parse(raw)
    if (!isRecord(data) || data.v !== VERSION || typeof data.base !== 'string') return null
    if (!isLayoutShape(data.saved) || !isLayoutShape(data.layout)) return null
    return { base: data.base, saved: data.saved, layout: data.layout }
  } catch {
    return null
  }
}

/** The draft kept for `seed`, and whether it still applies to the layout the server has now. */
export function loadLayoutDraft(seed: Pick<Seed, 'slug' | 'layout'>): LayoutDraftLookup {
  let raw: string | null = null
  try {
    raw = sessionStorage.getItem(KEY_PREFIX + seed.slug)
  } catch {
    return { status: 'none' }
  }
  const draft = parseDraft(raw)
  if (!draft) return { status: 'none' }
  return draft.base === fingerprintLayout(seed.layout as FormLayout | undefined)
    ? { status: 'ready', draft }
    : { status: 'stale' }
}

export function saveLayoutDraft(slug: string, draft: LayoutDraft): void {
  try {
    sessionStorage.setItem(KEY_PREFIX + slug, JSON.stringify({ v: VERSION, ...draft }))
  } catch {
    // Storage full or blocked: the builder keeps working, it just cannot survive a reload.
  }
}

export function clearLayoutDraft(slug: string): void {
  try {
    sessionStorage.removeItem(KEY_PREFIX + slug)
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
