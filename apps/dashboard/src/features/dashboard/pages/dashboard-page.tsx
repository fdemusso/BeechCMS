import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { StatCard } from "../components/stat-card"
import { RecentActivity } from "../components/recent-activity"
import { QuickActions } from "../components/quick-actions"
import { AIInsights } from "../components/ai-insights"
import { useDashboardStats, useCloudflareStats } from "../hooks/use-dashboard-stats"
import { FileText, Database, Globe, Zap } from "lucide-react"
import { getStoredUser } from "@/lib/api"

function getGreeting() {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return "Buongiorno"
  if (hour >= 12 && hour < 18) return "Buon pomeriggio"
  if (hour >= 18 && hour < 22) return "Buonasera"
  return "Buonanotte"
}

export default function DashboardPage() {
  const { data: statsData, isLoading: statsLoading } = useDashboardStats()
  const { data: cfData, isLoading: cfLoading } = useCloudflareStats()
  const user = getStoredUser()
  const greeting = getGreeting()
  const userName = user?.name || "Admin"

  const stats = [
    { 
      title: "Contenuti Totali", 
      value: statsLoading ? "..." : statsData?.total.toLocaleString() ?? "0", 
      icon: FileText, 
      description: "Tutte le collezioni", 
      trend: statsData?.total ? { 
        value: Math.round((statsData.recent / statsData.total) * 100), 
        isPositive: true 
      } : undefined 
    },
    { 
      title: "Visitatori Unici", 
      value: cfLoading ? "..." : cfData?.visitors.value.toLocaleString() ?? "0", 
      icon: Globe, 
      description: "Ultimi 30 giorni (Edge)", 
      trend: cfData?.visitors.trend ? { value: cfData.visitors.trend, isPositive: cfData.visitors.isPositive } : undefined 
    },
    { 
      title: "Traffico Totale", 
      value: cfLoading ? "..." : `${cfData?.bandwidth.value} ${cfData?.bandwidth.unit}`, 
      icon: Zap, 
      description: "Bandwidth Edge", 
      trend: cfData?.bandwidth.trend ? { value: cfData.bandwidth.trend, isPositive: cfData.bandwidth.isPositive } : undefined 
    },
    { 
      title: "Storage R2", 
      value: cfLoading ? "..." : `${cfData?.storage.used} ${cfData?.storage.unit}`, 
      icon: Database, 
      description: cfLoading ? "Caricamento..." : `${cfData?.storage.percentage}% di ${Math.round((cfData?.storage.limit ?? 0) / 1024)} GB`,
      trend: cfData ? { value: cfData.storage.percentage, isPositive: false } : undefined
    },
  ]

  const handleAction = (id: string) => {
    console.log("Action triggered:", id)
  }

  return (
    <div className="[--header-height:calc(--spacing(14))] overflow-x-hidden min-h-screen bg-neutral-50/50 dark:bg-neutral-950/50 relative">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/5 rounded-full blur-[120px]" />
      </div>

      <SidebarProvider className="flex flex-col relative z-10">
        <SiteHeader />
        <div className="flex flex-1">
          <AppSidebar />
          <SidebarInset className="min-w-0">
            <main className="flex flex-1 flex-col gap-8 p-6 md:p-8 lg:p-10">
              {/* Welcome Header */}
              <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight md:text-4xl text-neutral-900 dark:text-neutral-100 flex items-center gap-3">
                  {greeting}, {userName}
                </h1>
                <p className="text-neutral-500 dark:text-neutral-400 text-lg">
                  Ecco cosa è successo nel tuo workspace oggi.
                </p>
              </div>

              {/* Stats Row */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {stats.map((stat, i) => (
                  <StatCard key={i} {...stat} />
                ))}
              </div>

              {/* Main Bento Grid */}
              <div className="grid gap-6 md:grid-cols-3">
                {/* Left Column: Recent Activity (Spans 2 columns) */}
                <div className="md:col-span-2 space-y-6">
                  <RecentActivity />
                  
                </div>

                {/* Right Column: Actions & Insights */}
                <div className="space-y-6">
                  <QuickActions onAction={handleAction} />
                  <AIInsights />
                </div>
              </div>
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  )
}
