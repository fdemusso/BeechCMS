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
