// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import type { DashboardLayout } from '@beechcms/core'

/**
 * Unsaved dashboard-builder work, kept so that a page reload picks up where it left off. One draft per scope.
 *
 * It lives in `sessionStorage`: it survives a reload of the tab and nothing else. Leaving the builder on
 * purpose (Back, closing the dialog, saving) is not an interruption and removes the drafts, so a draft that
 * exists when the page loads means the work was cut short by the reload. It never reaches the server until
 * saved. Switching scope while the builder stays open keeps each scope's draft.
 *
 * Every read and write is guarded: storage can be blocked or full, and the builder must work exactly as
 * before when it is.
 */

const KEY_PREFIX = 'beechcms.dashboardDraft.'
const VERSION = 1

export interface DashboardDraft {
  /** Fingerprint of the layout stored on the server for this scope when the draft was made. */
  readonly base: string
  /** The layout the builder compares against to tell what is unsaved (its `isDirty` baseline). */
  readonly saved: DashboardLayout
  /** The work in progress. */
  readonly layout: DashboardLayout
}

export type DashboardDraftLookup =
  | { readonly status: 'none' }
  /** A draft exists but the server layout moved on since, so applying it could overwrite newer work. */
  | { readonly status: 'stale' }
  | { readonly status: 'ready'; readonly draft: DashboardDraft }

/**
 * A short, stable digest of a layout (djb2 over its JSON). `undefined` and `null`, a scope with nothing
 * stored, share one value: the generated default carries fresh random ids on every load and could never be
 * compared.
 */
export function fingerprintDashboardLayout(layout: DashboardLayout | null | undefined): string {
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
 * Structural check only. A draft is work in progress and may break rules the saved layout must keep (a page
 * with a blank name, say); the strict schema would throw exactly that work away.
 */
function isLayoutShape(value: unknown): value is DashboardLayout {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.pages)) return false
  return value.pages.every(
    (page) =>
      isRecord(page) &&
      typeof page.id === 'string' &&
      typeof page.label === 'string' &&
      Array.isArray(page.sections) &&
      page.sections.every(
        (section) =>
          isRecord(section) &&
          typeof section.id === 'string' &&
          Array.isArray(section.columns) &&
          section.columns.every(
            (column) => isRecord(column) && typeof column.id === 'string' && Array.isArray(column.widgets),
          ),
      ),
  )
}

function parseDraft(raw: string | null): DashboardDraft | null {
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

/** The draft kept for `scope`, and whether it still applies to the layout the server has now. */
export function loadDashboardDraft(scope: string, serverLayout: DashboardLayout | null | undefined): DashboardDraftLookup {
  let raw: string | null = null
  try {
    raw = sessionStorage.getItem(KEY_PREFIX + scope)
  } catch {
    return { status: 'none' }
  }
  const draft = parseDraft(raw)
  if (!draft) return { status: 'none' }
  return draft.base === fingerprintDashboardLayout(serverLayout) ? { status: 'ready', draft } : { status: 'stale' }
}

export function saveDashboardDraft(scope: string, draft: DashboardDraft): void {
  try {
    sessionStorage.setItem(KEY_PREFIX + scope, JSON.stringify({ v: VERSION, ...draft }))
  } catch {
    // Storage full or blocked: the builder keeps working, it just cannot survive a reload.
  }
}

export function clearDashboardDraft(scope: string): void {
  try {
    sessionStorage.removeItem(KEY_PREFIX + scope)
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

function draftKeys(): string[] {
  try {
    return Array.from({ length: sessionStorage.length }, (_, index) => sessionStorage.key(index) ?? '').filter((key) =>
      key.startsWith(KEY_PREFIX),
    )
  } catch {
    return []
  }
}

/** Scopes that hold a draft right now (whether or not it is still current). */
export function listDashboardDraftScopes(): string[] {
  return draftKeys().map((key) => key.slice(KEY_PREFIX.length))
}

/** Leaving the builder on purpose drops every scope's draft. */
export function clearAllDashboardDrafts(): void {
  for (const key of draftKeys()) {
    try {
      sessionStorage.removeItem(key)
    } catch {
      // Nothing to clear if storage is unavailable.
    }
  }
}
