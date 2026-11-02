// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from 'react'
import type { DashboardLayout } from '@beechcms/core'
import {
  DASHBOARD_DRAFT_KEY,
  clearDashboardDraft,
  fingerprintDashboardLayout,
  saveDashboardDraft,
} from './dashboard-draft-storage'

/** How long after the last change the draft is written; changes in quick succession share one write. */
const DRAFT_SAVE_DELAY_MS = 400

interface UseDashboardDraftPersistenceArgs {
  readonly serverLayout: DashboardLayout | null
  readonly draft: DashboardLayout
  readonly saved: DashboardLayout
  readonly isDirty: boolean
  readonly isDragging: boolean
}

/**
 * Keeps unsaved work in the tab's session storage so a reload resumes it (the dashboard page reopens the
 * builder when a draft is waiting). It is written shortly after each change, but never mid-drag (a widget
 * half-way between columns is not a state worth coming back to), and straight away when the page goes
 * away, which a pending timer would not survive.
 */
export function useDashboardDraftPersistence({
  serverLayout,
  draft,
  saved,
  isDirty,
  isDragging,
}: UseDashboardDraftPersistenceArgs): void {
  const base = React.useMemo(() => fingerprintDashboardLayout(serverLayout), [serverLayout])
  const latestRef = React.useRef({ draft, saved, isDirty, isDragging })
  React.useEffect(() => {
    latestRef.current = { draft, saved, isDirty, isDragging }
  })

  const writeDraftNow = React.useCallback(() => {
    const latest = latestRef.current
    if (!latest.isDirty || latest.isDragging) return
    saveDashboardDraft(DASHBOARD_DRAFT_KEY, { base, saved: latest.saved, layout: latest.draft })
  }, [base])

  React.useEffect(() => {
    if (isDragging) return
    if (!isDirty) {
      clearDashboardDraft(DASHBOARD_DRAFT_KEY)
      return
    }
    const timer = window.setTimeout(writeDraftNow, DRAFT_SAVE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [draft, isDirty, isDragging, writeDraftNow])

  React.useEffect(() => {
    window.addEventListener('pagehide', writeDraftNow)
    return () => window.removeEventListener('pagehide', writeDraftNow)
  }, [writeDraftNow])
}
