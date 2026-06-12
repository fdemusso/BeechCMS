// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { z } from 'zod'
import type { Seed } from './types.js'

// ---------------------------------------------------------------------------
// Dashboard layout interfaces
// ---------------------------------------------------------------------------

/** A placed widget. `type` is namespaced ('core/stat', '@acme/weather').
 *  `config` is opaque to core/API except for the optional `seedSlug` key,
 *  which enables auto-cleanup when the referenced seed disappears. */
export interface DashboardWidgetInstance {
  id: string                       // stable client-generated id (crypto.randomUUID)
  type: string
  title?: string                   // optional user override of the widget's default title
  config: Record<string, unknown>
}

export interface DashboardColumn {
  id: string
  widgets: DashboardWidgetInstance[]   // ordered vertical stack; may be empty
}

export interface DashboardSection {
  id: string
  label?: string
  hideLabel?: boolean
  collapsible?: boolean
  /** 1–4 columns. Enforced by validator. */
  columns: DashboardColumn[]
  /** Optional spans on a 12-unit grid, parallel to `columns`, must sum to 12.
   *  Absent = equal split. */
  columnSpans?: number[]
}

export interface DashboardPageLayout {
  id: string
  /** URL identity (?page=<slug>). Unique within the layout. */
  slug: string
  label: string
  /** Lucide icon name, same convention as DashboardSeedConfig.icon. */
  icon?: string
  sections: DashboardSection[]
}

export interface DashboardLayout {
  /** Format version — bump when introducing breaking changes. */
  version: 1
  pages: DashboardPageLayout[]
}

// ---------------------------------------------------------------------------
// Shared rules used by both the Zod schemas and the semantic validator.
// ---------------------------------------------------------------------------

/** Namespaced widget type — lowercase npm-name-compatible.
 *  Built-ins use the 'core/' prefix; custom widgets '@scope/name'. */
export const WIDGET_TYPE_REGEX = /^[a-z0-9@][a-z0-9@/_-]*$/

/** Max serialized size of a single widget `config`
 *  (`JSON.stringify(widget.config).length`) — guards D1 row bloat. */
export const MAX_WIDGET_CONFIG_BYTES = 8192

// ---------------------------------------------------------------------------
// Zod schemas for shape validation
// ---------------------------------------------------------------------------

export const dashboardWidgetInstanceSchema = z.object({
  id: z.string().min(1),
  type: z.string().regex(WIDGET_TYPE_REGEX),
  title: z.string().max(80).optional(),
  config: z.record(z.string(), z.unknown()),
})
export const dashboardColumnSchema = z.object({
  id: z.string().min(1),
  widgets: z.array(dashboardWidgetInstanceSchema),
})
export const dashboardSectionSchema = z.object({
  id: z.string().min(1),
  label: z.string().max(60).optional(),
  hideLabel: z.boolean().optional(),
  collapsible: z.boolean().optional(),
  columns: z.array(dashboardColumnSchema).min(1).max(4),
  columnSpans: z.array(z.number().int().min(1).max(12)).optional(),
})
export const dashboardPageSchema = z.object({
  id: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).max(40),
  label: z.string().min(1).max(60),
  icon: z.string().max(40).optional(),
  sections: z.array(dashboardSectionSchema).min(1),
})
export const dashboardLayoutSchema = z.object({
  version: z.literal(1),
  pages: z.array(dashboardPageSchema).min(1).max(8),
})

// ---------------------------------------------------------------------------
// Default dashboard layout generator
// ---------------------------------------------------------------------------

const defaultIdFactory = (): string => crypto.randomUUID()

/** Structural port of the legacy hardcoded dashboard config into a single
 *  'Overview' page. Widgets fetch their own data: configs carry only the
 *  variant and (where relevant) the default seed binding. */
export function generateDefaultDashboardLayout(
  seeds: Seed[],
  opts?: { newId: () => string },
): DashboardLayout {
  const newId = opts?.newId ?? defaultIdFactory

  const widget = (
    type: string,
    config: Record<string, unknown>,
  ): DashboardWidgetInstance => ({ id: newId(), type, config })

  const singleWidgetColumn = (w: DashboardWidgetInstance): DashboardColumn => ({
    id: newId(),
    widgets: [w],
  })

  const sections: DashboardSection[] = []

  // Setup checklist, full width.
  sections.push({
    id: newId(),
    hideLabel: true,
    columns: [singleWidgetColumn(widget('core/setup-checklist', { variant: 'full' }))],
  })

  // Status row: equal columns; quick-draft needs at least one seed to target.
  const statusWidgets = [
    widget('core/site-status', { variant: 'badge' }),
    widget('core/storage', { variant: 'gauge' }),
    widget('core/publication-stats', { variant: 'trio' }),
  ]
  if (seeds.length > 0) {
    statusWidgets.push(widget('core/quick-draft', { variant: 'minimal' }))
  }
  sections.push({
    id: newId(),
    hideLabel: true,
    columns: statusWidgets.map(singleWidgetColumn),
  })

  if (seeds.length > 0) {
    const seedSlug = seeds.find((s) => s.slug === 'articoli')?.slug ?? seeds[0].slug

    // Content row: recent content | pending drafts.
    sections.push({
      id: newId(),
      hideLabel: true,
      columns: [
        singleWidgetColumn(widget('core/recent-content', { seedSlug, variant: 'list' })),
        singleWidgetColumn(widget('core/pending-drafts', { seedSlug, variant: 'list' })),
      ],
      columnSpans: [6, 6],
    })

    // Media & activity row: media gallery | activity feed.
    sections.push({
      id: newId(),
      hideLabel: true,
      columns: [
        singleWidgetColumn(widget('core/media-gallery', { seedSlug, variant: 'grid' })),
        singleWidgetColumn(widget('core/activity-feed', { seedSlug, variant: 'feed' })),
      ],
      columnSpans: [6, 6],
    })
  }

  return {
    version: 1,
    pages: [
      {
        id: newId(),
        slug: 'overview',
        label: 'Overview',
        icon: 'LayoutDashboard',
        sections,
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// Semantic validator + auto-cleanup
// ---------------------------------------------------------------------------

export interface DashboardLayoutContext {
  /** Slugs of currently registered seeds (from ISeedRegistry.all()). */
  seedSlugs: ReadonlySet<string>
  /** Optional: widget types known to the caller (frontend registry).
   *  When provided, unknown types produce WARNINGS, never strips. */
  knownWidgetTypes?: ReadonlySet<string>
}

export type ValidateDashboardLayoutResult =
  | { ok: true; cleaned: DashboardLayout; warnings: string[] }
  | { ok: false; errors: string[]; cleaned: DashboardLayout; warnings: string[] }

/** Semantic validation on top of the Zod shape check (the caller's job).
 *  Widgets bound to a seed that no longer exists are silently stripped
 *  (auto-cleanup, recorded as a warning). Unknown widget types only warn —
 *  custom widgets are invisible to the Worker and must never be stripped.
 *  `cleaned` is always returned, errors or not. */
export function validateDashboardLayout(
  layout: DashboardLayout,
  ctx: DashboardLayoutContext,
): ValidateDashboardLayoutResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Auto-cleanup: drop widgets whose config.seedSlug references a missing seed.
  const cleanedPages: DashboardPageLayout[] = layout.pages.map((page) => ({
    ...page,
    sections: page.sections.map((section) => ({
      ...section,
      columns: section.columns.map((col) => ({
        ...col,
        widgets: (col.widgets ?? []).filter((w) => {
          const seedSlug = (w.config ?? {})['seedSlug']
          if (typeof seedSlug === 'string' && !ctx.seedSlugs.has(seedSlug)) {
            warnings.push(
              `Widget '${w.type}' (id=${w.id}) removed: seed '${seedSlug}' is not registered.`,
            )
            return false
          }
          return true
        }),
      })),
    })),
  }))

  // Semantic checks on the cleaned layout
  const seenWidgetIds = new Set<string>()
  const seenPageSlugs = new Set<string>()

  for (const page of cleanedPages) {
    if (seenPageSlugs.has(page.slug)) {
      errors.push(`Page slug '${page.slug}' appears more than once in the layout.`)
    } else {
      seenPageSlugs.add(page.slug)
    }

    for (const section of page.sections) {
      if (section.columnSpans !== undefined) {
        if (section.columnSpans.length !== section.columns.length) {
          errors.push(
            `Section ${section.id}: columnSpans has ${section.columnSpans.length} entries for ${section.columns.length} columns.`,
          )
        } else {
          const sum = section.columnSpans.reduce((acc, span) => acc + span, 0)
          if (sum !== 12) {
            errors.push(`Section ${section.id}: columnSpans must sum to 12, got ${sum}.`)
          }
        }
      }

      for (const col of section.columns) {
        for (const w of col.widgets) {
          if (seenWidgetIds.has(w.id)) {
            errors.push(`Widget id '${w.id}' appears more than once in the layout.`)
          } else {
            seenWidgetIds.add(w.id)
          }

          if (JSON.stringify(w.config ?? {}).length > MAX_WIDGET_CONFIG_BYTES) {
            errors.push(
              `Widget '${w.type}' (id=${w.id}): config exceeds ${MAX_WIDGET_CONFIG_BYTES} bytes when serialized.`,
            )
          }

          if (ctx.knownWidgetTypes !== undefined && !ctx.knownWidgetTypes.has(w.type)) {
            warnings.push(`Widget '${w.type}' (id=${w.id}) is not a known widget type.`)
          }
        }
      }
    }
  }

  const cleaned: DashboardLayout = { ...layout, pages: cleanedPages }
  if (errors.length > 0) return { ok: false, errors, cleaned, warnings }
  return { ok: true, cleaned, warnings }
}
