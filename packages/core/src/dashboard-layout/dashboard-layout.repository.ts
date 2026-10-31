// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { DashboardLayout } from './dashboard-layout.js'

/** Storage key of the one dashboard layout. Rows under any other key are ignored. */
export const DEFAULT_DASHBOARD_SCOPE = 'default'

export interface DashboardLayoutRecord {
  scope: string
  layout: DashboardLayout
  updatedAt: number      // unix seconds
  updatedBy: string      // user id
}

export interface IDashboardLayoutRepository {
  /** Stored layout for a scope, or null if none was ever saved. */
  get(scope: string): Promise<DashboardLayoutRecord | null>
  /** Upsert. `updatedBy` is the writer's user id. */
  upsert(scope: string, layout: DashboardLayout, updatedBy: string): Promise<void>
  /** Remove the stored row — the "Reset" action. */
  remove(scope: string): Promise<void>
}
