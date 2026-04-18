import { Card, CardContent } from "@/components/ui/card"
import type { LucideIcon } from "lucide-react"

interface StatCardProps {
  title: string
  value: string | number
  icon: LucideIcon
  description?: string
  trend?: {
    value: number
    isPositive: boolean
  }
}

export function StatCard({ title, value, icon: Icon, description, trend }: StatCardProps) {
  return (
    <Card className="overflow-hidden border-none bg-background/50 backdrop-blur-sm transition-all hover:bg-background/80 hover:shadow-lg">
      <CardContent className="p-6">
        <div className="flex items-center justify-between space-x-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <h3 className="text-2xl font-bold tracking-tight">{value}</h3>
            {description && (
              <p className="mt-1 text-xs text-muted-foreground">
                {description}
                {trend && (
                  <span className={`ml-1 ${trend.isPositive ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {trend.isPositive ? '+' : '-'}{trend.value}%
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="rounded-2xl bg-primary/10 p-3 text-primary">
            <Icon size={24} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
