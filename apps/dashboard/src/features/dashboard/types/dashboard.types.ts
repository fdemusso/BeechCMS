export interface DashboardStats {
  total: number
  recent: number
  periodDays: number
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
  action: 'create' | 'update' | 'delete' | 'upload'
  entity_type: 'content' | 'media'
  entity_id: string
  entity_slug?: string
  details?: Record<string, any>
  created_at: number
}
