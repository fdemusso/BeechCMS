// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

export interface DashboardStats {
  total: number
  today: number
  week: number
  month: number
}

export interface CloudflareMetric {
  value: number
  unit?: string
  trend: number
  isPositive: boolean
}

export interface CloudflareStats {
  visitors: CloudflareMetric
  requests: CloudflareMetric
  bandwidth: CloudflareMetric
  cacheRate: CloudflareMetric
  storage: {
    used: number
    limit: number
    unit: string
    percentage: number
  }
}
export interface RecentActivity {
  id: string
  user_id: string
  user_email: string
  user_name?: string | null
  action: 'create' | 'update' | 'delete' | 'upload'
  entity_type: 'content' | 'media' | 'seed'
  entity_id: string
  entity_slug?: string
  details?: Record<string, any>
  created_at: number
}
export interface SystemHealth {
  storage: {
    used: number
    limit: number
    percentage: number
  }
  database: {
    requests30d: number
    limit: number
    percentage: number
  }
  status: 'healthy' | 'warning' | 'critical'
  lastUpdate: number
}

export interface ContentBreakdown {
  slug: string
  label: string
  count: number
  color?: string
}

export interface SetupChecklist {
  systemTablesOk: boolean
  seedsCount: number
  contentTablesOk: boolean
  adminExists: boolean
  hasContent: boolean
  firstSeedSlug: string | null
}
