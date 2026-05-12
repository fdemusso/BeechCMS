import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar, SiteHeader } from "@/features/navigation"
import { DashboardWidgetShell } from "@/features/dashboard"
import {
  SiteStatusWidget,
  StorageWidget,
  PublicationStatsWidget,
  QuickDraftWidget,
  RecentContentWidget,
  PendingDraftsWidget,
  MediaGalleryWidget,
  ActivityFeedWidget,
} from "@/features/dashboard/widgets"
import { useSchema } from "@/features/schema"
import { cn } from "@/lib/utils"

// ─── Helpers ────────────────────────────────────────────────────────────────


// ─── Layout primitives ──────────────────────────────────────────────────────

function LabSection({ title, description, children }: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      {children}
    </section>
  )
}

function LabRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-4", className)}>
      {children}
    </div>
  )
}

function LabCell({ label, h = 120, children }: {
  label: string
  h?: number
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-mono text-muted-foreground/70">{label}</p>
      <div style={{ height: h }}>
        {children}
      </div>
    </div>
  )
}

// ─── Placeholder for in-progress widgets ────────────────────────────────────

function LabPlaceholder({ name }: { name: string }) {
  return (
    <DashboardWidgetShell>
      <div className="flex h-full items-center justify-center">
        <p className="text-sm font-mono text-muted-foreground/50">{name}</p>
      </div>
    </DashboardWidgetShell>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────

export function WidgetLabPage() {
  const { data: seeds = [] } = useSchema()
  
  const allSeeds = seeds.map((seed) => {
    const nameBranch = seed.branches.find((b) => b.alias === seed.displayNameAlias)
    return {
      slug: seed.slug,
      label: seed.label,
      displayNameAlias: seed.displayNameAlias,
      displayNameLabel: nameBranch?.label ?? seed.displayNameAlias,
    }
  })

  const firstSeedSlug = allSeeds[0]?.slug ?? ""

  return (
    <div className="[--header-height:calc(--spacing(14))]">
      <SidebarProvider className="flex flex-col">
        <SiteHeader />
        <div className="flex flex-1">
          <AppSidebar />
          <SidebarInset>
            <div className="mx-auto w-full max-w-screen-2xl p-6 space-y-12">

              {/* Page header */}
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Widget Lab</h1>
                <p className="text-muted-foreground text-sm mt-1">
                  Sandbox per sviluppare e ispezionare i widget prima di portarli in dashboard.
                  Ogni sezione mostra un widget in tutte le sue varianti di dimensione.
                </p>
              </div>

              {/* ── SiteStatus ────────────────────────────────────────────── */}
              <LabSection
                title="SiteStatusWidget"
                description={"type=\"site-status\" — mostra lo stato online/offline dell'API"}
              >
                <LabRow className="grid-cols-2">
                  <LabCell label={"variant=\"badge\" · span w:2 h:1"}>
                    <SiteStatusWidget variant="badge" />
                  </LabCell>
                  <LabCell label={"variant=\"pill-row\" · span w:3 h:1"}>
                    <SiteStatusWidget variant="pill-row" />
                  </LabCell>
                </LabRow>
              </LabSection>

              {/* ── Storage ───────────────────────────────────────────────── */}
              <LabSection
                title="StorageWidget"
                description={"type=\"storage\" — utilizzo storage R2"}
              >
                <LabRow className="grid-cols-2">
                  <LabCell label={"variant=\"gauge\" · span w:2 h:1"}>
                    <StorageWidget variant="gauge" />
                  </LabCell>
                  <LabCell label={"variant=\"bar\" · span w:3 h:1"}>
                    <StorageWidget variant="bar" />
                  </LabCell>
                </LabRow>
              </LabSection>

              {/* ── PublicationStats ──────────────────────────────────────── */}
              <LabSection
                title="PublicationStatsWidget"
                description={"type=\"publication-stats\" — contenuti pubblicati oggi / settimana / mese"}
              >
                <LabRow className="grid-cols-2">
                  <LabCell label={"variant=\"trio\" · span w:2 h:1"}>
                    <PublicationStatsWidget variant="trio" />
                  </LabCell>
                  <LabCell label={"variant=\"single\" · span w:2 h:1"}>
                    <PublicationStatsWidget variant="single" />
                  </LabCell>
                </LabRow>
              </LabSection>

              {/* ── QuickDraft ────────────────────────────────────────────── */}
              <LabSection
                title="QuickDraftWidget"
                description={"type=\"quick-draft\" — crea velocemente una bozza senza navigare"}
              >
                <LabRow className="grid-cols-2">
                  <LabCell label={"variant=\"minimal\" · span w:2 h:1"}>
                    <QuickDraftWidget variant="minimal" seeds={allSeeds} />
                  </LabCell>
                  <LabCell label={"variant=\"expanded\" · span w:4 h:2"} h={200}>
                    <QuickDraftWidget variant="expanded" seeds={allSeeds} />
                  </LabCell>
                </LabRow>
              </LabSection>

              {/* ── RecentContent ─────────────────────────────────────────── */}
              <LabSection
                title="RecentContentWidget"
                description={"type=\"recent-content\" — lista degli ultimi contenuti modificati"}
              >
                <LabRow className="grid-cols-2">
                  <LabCell label={"variant=\"list\" · span w:4 h:2"} h={280}>
                    <RecentContentWidget seedSlug={firstSeedSlug} variant="list" />
                  </LabCell>
                  <LabCell label={"variant=\"cards\" · span w:4 h:2"} h={280}>
                    <RecentContentWidget seedSlug={firstSeedSlug} variant="cards" />
                  </LabCell>
                </LabRow>
              </LabSection>

              {/* ── PendingDrafts ─────────────────────────────────────────── */}
              <LabSection
                title="PendingDraftsWidget"
                description={"type=\"pending-drafts\" — bozze in attesa di revisione / pubblicazione"}
              >
                <LabRow className="grid-cols-2">
                  <LabCell label={"variant=\"counter\" · span w:2 h:1"}>
                    <PendingDraftsWidget seedSlug={firstSeedSlug} variant="counter" />
                  </LabCell>
                  <LabCell label={"variant=\"list\" · span w:4 h:2"} h={280}>
                    <PendingDraftsWidget seedSlug={firstSeedSlug} variant="list" />
                  </LabCell>
                </LabRow>
              </LabSection>

              {/* ── MediaGallery ──────────────────────────────────────────── */}
              <LabSection
                title="MediaGalleryWidget"
                description={"type=\"media-gallery\" — anteprima griglia dei media caricati"}
              >
                <LabRow className="grid-cols-2">
                  <LabCell label={"variant=\"grid\" · span w:4 h:2"} h={280}>
                    <MediaGalleryWidget seedSlug={firstSeedSlug} variant="grid" />
                  </LabCell>
                  <LabCell label={"variant=\"unused\" · span w:4 h:2"} h={280}>
                    <MediaGalleryWidget seedSlug={firstSeedSlug} variant="unused" />
                  </LabCell>
                </LabRow>
              </LabSection>

              {/* ── ActivityFeed ──────────────────────────────────────────── */}
              <LabSection
                title="ActivityFeedWidget"
                description={"type=\"activity-feed\" — log delle ultime azioni nel CMS"}
              >
                <LabRow className="grid-cols-2">
                  <LabCell label={"variant=\"compact\" · span w:2 h:1"}>
                    <ActivityFeedWidget variant="compact" />
                  </LabCell>
                  <LabCell label={"variant=\"feed\" · span w:4 h:2"} h={280}>
                    <ActivityFeedWidget variant="feed" />
                  </LabCell>
                </LabRow>
              </LabSection>

              {/* ── IN SVILUPPO ───────────────────────────────────────────── */}
              <LabSection
                title="In sviluppo"
                description="Nuovi widget in costruzione — aggiungi qui i tuoi componenti prima di registrarli."
              >
                <LabRow className="grid-cols-3">
                  <LabCell label="nuovo-widget-1">
                    <LabPlaceholder name="nuovo-widget-1" />
                  </LabCell>
                  <LabCell label="nuovo-widget-2">
                    <LabPlaceholder name="nuovo-widget-2" />
                  </LabCell>
                  <LabCell label="nuovo-widget-3">
                    <LabPlaceholder name="nuovo-widget-3" />
                  </LabCell>
                </LabRow>
              </LabSection>

            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  )
}
