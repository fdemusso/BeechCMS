// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import type { DashboardLayout } from '@beechcms/core'
import {
  createDraftStorage,
  fingerprintLayout,
  isRecord,
  type BuilderDraft,
  type BuilderDraftLookup,
} from '@/components/builder/draft-storage'

/**
 * Unsaved dashboard-builder work, kept so that a page reload picks up where it left off. One draft per key
 * (`DASHBOARD_DRAFT_KEY`: the dashboard has a single layout, so there is only ever one). The mechanics are
 * shared (`createDraftStorage`); this file says what a dashboard layout looks like. Leaving the builder on
 * purpose drops the draft.
 */

/** The one key the builder stores its draft under: the dashboard has a single layout. */
export const DASHBOARD_DRAFT_KEY = 'layout'

export type DashboardDraft = BuilderDraft<DashboardLayout>
export type DashboardDraftLookup = BuilderDraftLookup<DashboardLayout>

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

const storage = createDraftStorage<DashboardLayout>({ keyPrefix: 'beechcms.dashboardDraft.', isShape: isLayoutShape })

export const fingerprintDashboardLayout = (layout: DashboardLayout | null | undefined) => fingerprintLayout(layout)
export const loadDashboardDraft = storage.load
export const saveDashboardDraft = storage.save
export const clearDashboardDraft = storage.clear
/** Keys that hold a draft right now (whether or not it is still current). */
export const listDashboardDraftScopes = storage.names
/** Leaving the builder on purpose drops the draft. */
export const clearAllDashboardDrafts = storage.clearAll
