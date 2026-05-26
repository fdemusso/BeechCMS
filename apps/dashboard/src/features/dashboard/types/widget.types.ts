// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.


export type WidgetType = 
  | "stat" 
  | "recent-activity" 
  | "system-health" 
  | "content-pulse" 
  | "ai-insights" 
  | "quick-actions"
  // New widgets (v2)
  | "recent-content"
  | "quick-draft"
  | "pending-drafts"
  | "publication-stats"
  | "site-status"
  | "storage"
  | "media-gallery"
  | "activity-feed"
  | "setup-checklist"

export interface WidgetGridSpan {
  w: number // Number of columns (out of 8)
  h: number // Number of rows
}

export interface WidgetInstance {
  id: string
  type: WidgetType
  x: number // Column start index (0-7)
  y: number // Row start index
  span: WidgetGridSpan
  title?: string
  props?: Record<string, any>
}

export interface DashboardConfig {
  layout: WidgetInstance[]
}

export interface BaseWidgetProps {
  instance: WidgetInstance
  className?: string
}
