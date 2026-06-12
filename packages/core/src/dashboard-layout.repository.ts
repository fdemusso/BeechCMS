// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { DashboardLayout } from './dashboard-layout.js'

export interface DashboardLayoutRecord {
  scope: string
  layout: DashboardLayout
  updatedAt: number      // unix seconds
  updatedBy: string      // user id
}

export interface IDashboardLayoutRepository {
  /** Stored layout for a scope, or null if none was ever saved. */
  get(scope: string): Promise<DashboardLayoutRecord | null>
  /** Scopes that currently have a stored row — used by the Sprint 06 builder UI. */
  listScopes(): Promise<string[]>
  /** Upsert. `updatedBy` is the writer's user id. */
  upsert(scope: string, layout: DashboardLayout, updatedBy: string): Promise<void>
  /** Remove the stored row — the "Reset" action. */
  remove(scope: string): Promise<void>
}
