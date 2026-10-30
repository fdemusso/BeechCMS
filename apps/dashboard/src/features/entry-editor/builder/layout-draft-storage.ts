// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { FormLayout, Seed } from '@beechcms/core'
import {
  createDraftStorage,
  fingerprintLayout,
  isRecord,
  type BuilderDraft,
  type BuilderDraftLookup,
} from '@/components/builder/draft-storage'

/**
 * Unsaved layout-builder work, kept so that a page reload picks up where it left off. One draft per seed.
 * The mechanics are shared (`createDraftStorage`: `sessionStorage`, a fingerprint of the server layout, every
 * access guarded); this file says what an entry layout looks like and names the key. Leaving the builder on
 * purpose (cancel, close, save) is not an interruption and removes the draft.
 */

export type LayoutDraft = BuilderDraft<FormLayout>
export type LayoutDraftLookup = BuilderDraftLookup<FormLayout>

export { fingerprintLayout }

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

const storage = createDraftStorage<FormLayout>({ keyPrefix: 'beechcms.layoutDraft.', isShape: isLayoutShape })

/** The draft kept for `seed`, and whether it still applies to the layout the server has now. */
export const loadLayoutDraft = (seed: Pick<Seed, 'slug' | 'layout'>): LayoutDraftLookup =>
  storage.load(seed.slug, seed.layout as FormLayout | undefined)
export const saveLayoutDraft = storage.save
export const clearLayoutDraft = storage.clear
