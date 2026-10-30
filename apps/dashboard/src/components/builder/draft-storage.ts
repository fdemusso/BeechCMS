// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

/*
 * Unsaved layout-builder work, kept so that a page reload picks up where it left off. Shared by the entry builder
 * and the dashboard builder; each wraps `createDraftStorage` with its own key prefix and layout shape.
 *
 * It lives in `sessionStorage`: it survives a reload of the tab and nothing else. Leaving the builder on
 * purpose is not an interruption and removes the draft, so a draft that exists when the page loads means the
 * work was cut short by the reload. It never reaches the server until saved.
 *
 * Every read and write is guarded: storage can be blocked or full, and the builder must work exactly as before
 * when it is.
 */

const VERSION = 1

export interface BuilderDraft<TLayout> {
  /** Fingerprint of the layout stored on the server when the draft was made. */
  readonly base: string
  /** The layout the builder compares against to tell what is unsaved (its `isDirty` baseline). */
  readonly saved: TLayout
  /** The work in progress. */
  readonly layout: TLayout
}

export type BuilderDraftLookup<TLayout> =
  | { readonly status: 'none' }
  /** A draft exists but the server layout moved on since, so applying it could overwrite newer work. */
  | { readonly status: 'stale' }
  | { readonly status: 'ready'; readonly draft: BuilderDraft<TLayout> }

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * A short, stable digest of a layout (djb2 over its JSON). `undefined` and `null`, a layout with nothing
 * stored, share one value: the generated default carries fresh random ids on every load and could never be
 * compared.
 */
export function fingerprintLayout(layout: unknown): string {
  const json = JSON.stringify(layout ?? null)
  let hash = 5381
  for (let index = 0; index < json.length; index += 1) {
    hash = ((hash << 5) + hash + json.charCodeAt(index)) | 0
  }
  return `${json.length}:${(hash >>> 0).toString(36)}`
}

export interface DraftStorageConfig<TLayout> {
  readonly keyPrefix: string
  /**
   * Structural check only. A draft is work in progress and may break rules the saved layout must keep (a blank
   * page name, say); the strict schema would throw exactly that work away.
   */
  readonly isShape: (value: unknown) => value is TLayout
}

export function createDraftStorage<TLayout>({ keyPrefix, isShape }: DraftStorageConfig<TLayout>) {
  function parse(raw: string | null): BuilderDraft<TLayout> | null {
    if (!raw) return null
    try {
      const data: unknown = JSON.parse(raw)
      if (!isRecord(data) || data.v !== VERSION || typeof data.base !== 'string') return null
      if (!isShape(data.saved) || !isShape(data.layout)) return null
      return { base: data.base, saved: data.saved, layout: data.layout }
    } catch {
      return null
    }
  }

  function keys(): string[] {
    try {
      return Array.from({ length: sessionStorage.length }, (_, index) => sessionStorage.key(index) ?? '').filter((key) =>
        key.startsWith(keyPrefix),
      )
    } catch {
      return []
    }
  }

  return {
    /** The draft kept under `name`, and whether it still applies to the layout the server has now. */
    load(name: string, serverLayout: TLayout | null | undefined): BuilderDraftLookup<TLayout> {
      let raw: string | null = null
      try {
        raw = sessionStorage.getItem(keyPrefix + name)
      } catch {
        return { status: 'none' }
      }
      const draft = parse(raw)
      if (!draft) return { status: 'none' }
      return draft.base === fingerprintLayout(serverLayout) ? { status: 'ready', draft } : { status: 'stale' }
    },

    save(name: string, draft: BuilderDraft<TLayout>): void {
      try {
        sessionStorage.setItem(keyPrefix + name, JSON.stringify({ v: VERSION, ...draft }))
      } catch {
        // Storage full or blocked: the builder keeps working, it just cannot survive a reload.
      }
    },

    clear(name: string): void {
      try {
        sessionStorage.removeItem(keyPrefix + name)
      } catch {
        // Nothing to clear if storage is unavailable.
      }
    },

    /** Names that hold a draft right now (whether or not it is still current). */
    names(): string[] {
      return keys().map((key) => key.slice(keyPrefix.length))
    },

    clearAll(): void {
      for (const key of keys()) {
        try {
          sessionStorage.removeItem(key)
        } catch {
          // Nothing to clear if storage is unavailable.
        }
      }
    },
  }
}
