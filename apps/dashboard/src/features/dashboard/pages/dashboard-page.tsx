import { useTranslation } from "react-i18next"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { WidgetRegistry } from "../components/widget-registry"
import { getDashboardConfig } from "../config/dashboard.config"
import { useDashboardStats, useCloudflareStats } from "../hooks/use-dashboard-stats"
import { useSchema } from "@/features/schema/hooks/use-schema"
import { useAuth } from "@/lib/auth-context"

export default function DashboardPage() {
  const { t } = useTranslation()
  const { data: seeds = [] } = useSchema()
  const { data: statsData, isLoading: statsLoading } = useDashboardStats()
  const { data: cfData, isLoading: cfLoading } = useCloudflareStats()
  const { user } = useAuth()
  const hour = new Date().getHours()
  const greeting = hour >= 5 && hour < 12
    ? t("dashboard.greeting.morning")
    : hour >= 12 && hour < 18
      ? t("dashboard.greeting.afternoon")
      : hour >= 18 && hour < 22
        ? t("dashboard.greeting.evening")
        : t("dashboard.greeting.night")
  const userName = user?.name || "Admin"

  // Data bundle for widgets
  const dashboardData = {
    statsData,
    cfData,
    statsLoading,
    cfLoading
  }

  return (
    <div className="[--header-height:calc(--spacing(14))] overflow-x-clip min-h-screen bg-neutral-50/50 dark:bg-neutral-950/50 relative">
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
              {/* Contenitore interno: limita la larghezza massima a 2200px
                  per una lettura ottimale sia su 16:9 che su 21:9. */}
              <div className="content-area-inner flex flex-col gap-8">
                {/* Welcome Header */}
                <div className="flex flex-col gap-1.5">
                  <h1 className="text-2xl font-bold tracking-tight md:text-3xl text-neutral-900 dark:text-neutral-100">
                    {greeting}, <span className="text-primary">{userName}</span>
                  </h1>
                  <p className="text-neutral-500 dark:text-neutral-400">
                    {t("dashboard.greeting.subtitle")}
                  </p>
                </div>

                {/* Pluggable 8-Column Grid
                    GRID_COLS must match the `lg:grid-cols-8` class below.
                    Spans are clamped so a misconfigured widget can never
                    cause horizontal overflow or push columns out of bounds.
                    Il container `.content-area-inner` limita a 2200px,
                    evitando widget troppo larghi su monitor 21:9.

                    Responsive strategy:
                    - mobile (<768px): 1-column, every widget is full width.
                      The inline `gridColumn/Row` styles are overridden by the
                      `.bento-cell-mobile` utility defined in index.css.
                    - md (768px+): 4-col grid, spans halved from the 8-col design.
                    - lg (1024px+): full 8-col bento as designed.
                    Inline styles carry the real span values; the CSS utility
                    resets them on mobile without dynamic Tailwind class names. */}
                <div className="bento-grid grid grid-cols-1 gap-6 md:grid-cols-4 lg:grid-cols-8 auto-rows-min">
                  {getDashboardConfig(seeds).layout.map((widget) => {
                    const GRID_COLS = 8
                    const safeW = Math.min(Math.max(1, widget.span.w), GRID_COLS)
                    const safeH = Math.min(Math.max(1, widget.span.h), 12)
                    // At md (4-col grid): halve the span, minimum 1
                    const mdSpan = Math.max(1, Math.ceil(safeW / 2))
                    return (
                      <div
                        key={widget.id}
                        className="bento-cell flex flex-col"
                        style={
                          {
                            "--col-span-md": mdSpan,
                            "--col-span-lg": safeW,
                            "--row-span": safeH,
                          } as React.CSSProperties
                        }
                      >
                        <WidgetRegistry
                          instance={widget}
                          data={dashboardData}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  )
}

