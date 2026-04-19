import type { DashboardConfig } from "../types/widget.types"

export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  layout: [
    // ─── Row 0: Status & Stats ──────────────────────────────────────────────
    {
      id: "site-status",
      type: "site-status",
      x: 0, y: 0, span: { w: 2, h: 1 },
      props: { variant: "badge" },
    },
    {
      id: "storage-gauge",
      type: "storage",
      x: 2, y: 0, span: { w: 2, h: 1 },
      props: { variant: "gauge" },
    },
    {
      id: "pub-stats-trio",
      type: "publication-stats",
      x: 4, y: 0, span: { w: 2, h: 1 },
      props: { variant: "trio" },
    },
    {
      id: "quick-draft-minimal",
      type: "quick-draft",
      x: 6, y: 0, span: { w: 2, h: 1 },
      props: {
        variant: "minimal",
        seeds: [
          { slug: "articoli", label: "Articolo" },
          { slug: "prodotti", label: "Prodotto" },
        ],
      },
    },

    // ─── Rows 1-2: Content Lists ────────────────────────────────────────────
    {
      id: "recent-content-list",
      type: "recent-content",
      x: 0, y: 1, span: { w: 4, h: 2 },
      props: { seedSlug: "articoli", variant: "list" },
    },
    {
      id: "pending-drafts-list",
      type: "pending-drafts",
      x: 4, y: 1, span: { w: 4, h: 2 },
      props: { seedSlug: "articoli", variant: "list" },
    },

    // ─── Rows 3-4: Media & Activity ─────────────────────────────────────────
    {
      id: "media-gallery-grid",
      type: "media-gallery",
      x: 0, y: 3, span: { w: 4, h: 2 },
      props: { seedSlug: "articoli", variant: "grid" },
    },
    {
      id: "activity-feed-full",
      type: "activity-feed",
      x: 4, y: 3, span: { w: 4, h: 2 },
      props: { seedSlug: "articoli", variant: "feed" },
    },

  ],
}
