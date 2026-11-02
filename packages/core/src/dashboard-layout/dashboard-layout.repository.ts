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

export type DashboardLayoutWriteResult =
  /** Written. `updatedAt` is the row's new version, null after a removal. */
  | { readonly ok: true; readonly updatedAt: number | null }
  /** Refused: the stored version no longer equals the expected one. */
  | { readonly ok: false }

export interface IDashboardLayoutRepository {
  /** Stored layout for a scope, or null if none was ever saved. */
  get(scope: string): Promise<DashboardLayoutRecord | null>
  /** Writes only while the stored `updatedAt` equals `expectedUpdatedAt` (null = no row stored). `updatedAt` strictly increases on every write. */
  save(scope: string, layout: DashboardLayout, updatedBy: string, expectedUpdatedAt: number | null): Promise<DashboardLayoutWriteResult>
  /** Removes the row only while its `updatedAt` equals `expectedUpdatedAt`; with null, succeeds only when no row is stored. */
  remove(scope: string, expectedUpdatedAt: number | null): Promise<DashboardLayoutWriteResult>
}
