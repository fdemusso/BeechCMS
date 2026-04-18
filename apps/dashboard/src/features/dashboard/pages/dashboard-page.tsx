import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { StatCard } from "../components/stat-card"
import { RecentActivity } from "../components/recent-activity"
import { QuickActions } from "../components/quick-actions"
import { AIInsights } from "../components/ai-insights"
import { useDashboardStats, useCloudflareStats } from "../hooks/use-dashboard-stats"
import { FileText, Users, Database, Activity, Star, Globe, Zap } from "lucide-react"

export default function DashboardPage() {
  const { data: statsData, isLoading: statsLoading } = useDashboardStats()
  const { data: cfData, isLoading: cfLoading } = useCloudflareStats()

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

  const activities = [
    { id: "1", user: { name: "Flavio", initials: "F" }, action: "ha aggiornato", target: "Homepage", timestamp: new Date(Date.now() - 1000 * 60 * 15) },
    { id: "2", user: { name: "Marco", initials: "M" }, action: "ha creato", target: "Nuovo Post Blog", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2) },
    { id: "3", user: { name: "AI Agent", initials: "AI", image: "/ai-avatar.png" }, action: "ha ottimizzato", target: "SEO Immagine #42", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5) },
    { id: "4", user: { name: "Sara", initials: "S" }, action: "ha rimosso", target: "Commento Spam", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24) },
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
                  Bentornato su Beech
                  <Star className="h-8 w-8 text-amber-400 fill-amber-400 animate-pulse" />
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
                  <RecentActivity activities={activities} />
                  
                  {/* Performance/Health Visualization Placeholder */}
                  <div className="rounded-3xl bg-neutral-900 p-8 text-white flex items-center justify-between overflow-hidden relative group">
                     <div className="relative z-10">
                        <h3 className="text-xl font-bold mb-2">Botanical Engine</h3>
                        <p className="text-neutral-400 max-w-xs text-sm">Il motore di generazione schemi è sincronizzato e ottimizzato.</p>
                        <div className="mt-4 flex items-center gap-2 text-emerald-400 text-sm font-semibold">
                           <div className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                           Sistema Ottimale
                        </div>
                     </div>
                     <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-emerald-500/20 via-transparent to-transparent group-hover:from-emerald-500/30 transition-all duration-700" />
                     <Activity className="h-24 w-24 text-neutral-800 absolute right-4 top-1/2 -translate-y-1/2 group-hover:scale-110 transition-transform duration-500" />
                  </div>
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
