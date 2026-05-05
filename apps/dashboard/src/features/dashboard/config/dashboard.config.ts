import type { DashboardConfig, WidgetInstance } from "../types/widget.types"
import type { Seed } from "@beechcms/core"

/** 
 * Genera la configurazione della dashboard in base ai seed disponibili.
 * Se non ci sono seed, mostra solo i widget di sistema.
 */
export function getDashboardConfig(seeds: Seed[]): DashboardConfig {
  const layout: WidgetInstance[] = [
    // ─── Row 0: Setup Checklist (auto-hides when setup complete) ──────────
    {
      id: "setup-checklist",
      type: "setup-checklist",
      x: 0, y: 0, span: { w: 8, h: 1 },
      props: { variant: "full" },
    },
    // ─── Row 1: Status & Stats (Sempre presenti) ──────────────────────────
    {
      id: "site-status",
      type: "site-status",
      x: 0, y: 1, span: { w: 2, h: 1 },
      props: { variant: "badge" },
    },
    {
      id: "storage-gauge",
      type: "storage",
      x: 2, y: 1, span: { w: 2, h: 1 },
      props: { variant: "gauge" },
    },
    {
      id: "pub-stats-trio",
      type: "publication-stats",
      x: 4, y: 1, span: { w: 2, h: 1 },
      props: { variant: "trio" },
    },
  ]

  // Se ci sono seed, aggiungiamo i widget di contenuto
  if (seeds.length > 0) {
    const firstSeed = seeds[0]
    const defaultSeedSlug = seeds.find(s => s.slug === "articoli")?.slug ?? firstSeed.slug

    // Preparazione per Quick Draft
    const seedsForQuickDraft = seeds.map((seed) => {
      const nameBranch = seed.branches.find((b) => b.alias === seed.displayNameAlias)
      return {
        slug: seed.slug,
        label: seed.label,
        displayNameAlias: seed.displayNameAlias,
        displayNameLabel: nameBranch?.label ?? seed.displayNameAlias,
      }
    })

    layout.push(
      {
        id: "quick-draft-minimal",
        type: "quick-draft",
        x: 6, y: 1, span: { w: 2, h: 1 },
        props: {
          variant: "minimal",
          seeds: seedsForQuickDraft,
        },
      },
      // ─── Rows 2-3: Content Lists ────────────────────────────────────────────
      {
        id: "recent-content-list",
        type: "recent-content",
        x: 0, y: 2, span: { w: 4, h: 2 },
        props: { seedSlug: defaultSeedSlug, variant: "list" },
      },
      {
        id: "pending-drafts-list",
        type: "pending-drafts",
        x: 4, y: 2, span: { w: 4, h: 2 },
        props: { seedSlug: defaultSeedSlug, variant: "list" },
      },
      // ─── Rows 4-5: Media & Activity ─────────────────────────────────────────
      {
        id: "media-gallery-grid",
        type: "media-gallery",
        x: 0, y: 4, span: { w: 4, h: 2 },
        props: { seedSlug: defaultSeedSlug, variant: "grid" },
      },
      {
        id: "activity-feed-full",
        type: "activity-feed",
        x: 4, y: 4, span: { w: 4, h: 2 },
        props: { seedSlug: defaultSeedSlug, variant: "feed" },
      }
    )
  }

  return { layout }
}
