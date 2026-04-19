import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { WidgetRegistry } from "../components/widget-registry"
import { DEFAULT_DASHBOARD_CONFIG } from "../config/dashboard.config"
import { useDashboardStats, useCloudflareStats } from "../hooks/use-dashboard-stats"
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

  // Data bundle for widgets
  const dashboardData = {
    statsData,
    cfData,
    statsLoading,
    cfLoading
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

              {/* Pluggable 8-Column Grid
                  GRID_COLS must match the `lg:grid-cols-8` class below.
                  Spans are clamped so a misconfigured widget can never
                  cause horizontal overflow or push columns out of bounds. */}
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-8 auto-rows-min">
                {DEFAULT_DASHBOARD_CONFIG.layout.map((widget) => {
                  const GRID_COLS = 8
                  const safeW = Math.min(Math.max(1, widget.span.w), GRID_COLS)
                  const safeH = Math.min(Math.max(1, widget.span.h), 12)
                  return (
                    <div
                      key={widget.id}
                      style={{
                        gridColumn: `span ${safeW}`,
                        gridRow: `span ${safeH}`,
                      }}
                      className="flex flex-col"
                    >
                      <WidgetRegistry
                        instance={widget}
                        data={dashboardData}
                      />
                    </div>
                  )
                })}
              </div>
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  )
}

