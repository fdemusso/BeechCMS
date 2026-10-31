// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, expect, it } from 'vitest'
import type { Seed } from '../engine/types.js'
import {
  MAX_DASHBOARD_LAYOUT_BYTES,
  MAX_ROLES_PER_PAGE,
  MAX_SECTIONS_PER_PAGE,
  MAX_WIDGETS_PER_COLUMN,
  MAX_WIDGET_CONFIG_BYTES,
  dashboardLayoutSchema,
  generateDefaultDashboardLayout,
  validateDashboardLayout,
  type DashboardLayout,
  type DashboardLayoutContext,
  type DashboardWidgetInstance,
} from './dashboard-layout.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deterministic id factory for snapshot-stable generator output. */
function sequentialIds(prefix = 'id'): () => string {
  let n = 0
  return () => `${prefix}-${++n}`
}

/** The generator only reads `slug` — a stub is enough for these tests. */
function seedStub(slug: string): Seed {
  return { slug } as unknown as Seed
}

function allWidgets(layout: DashboardLayout): DashboardWidgetInstance[] {
  return layout.pages.flatMap((page) =>
    page.sections.flatMap((section) => section.columns.flatMap((col) => col.widgets)),
  )
}

function widget(
  id: string,
  type: string,
  config: Record<string, unknown> = {},
): DashboardWidgetInstance {
  return { id, type, config }
}

/** One page ('overview'), one section, one column per widget stack passed in. */
function singleSectionLayout(
  stacks: DashboardWidgetInstance[][],
  columnSpans?: number[],
): DashboardLayout {
  return {
    version: 1,
    pages: [
      {
        id: 'p-1',
        slug: 'overview',
        label: 'Overview',
        sections: [
          {
            id: 's-1',
            columns: stacks.map((widgets, i) => ({ id: `c-${i + 1}`, widgets })),
            ...(columnSpans ? { columnSpans } : {}),
          },
        ],
      },
    ],
  }
}

const ctx: DashboardLayoutContext = { seedSlugs: new Set(['articoli', 'pagine']) }

// ---------------------------------------------------------------------------
// generateDefaultDashboardLayout
// ---------------------------------------------------------------------------

describe('generateDefaultDashboardLayout', () => {
  it('with zero seeds emits one page with setup + 3-column status sections only', () => {
    const layout = generateDefaultDashboardLayout([], { newId: sequentialIds() })

    expect(layout.version).toBe(1)
    expect(layout.pages).toHaveLength(1)

    const page = layout.pages[0]
    expect(page.slug).toBe('overview')
    expect(page.label).toBe('Overview')
    expect(page.icon).toBe('LayoutDashboard')
    expect(page.sections).toHaveLength(2)

    const [setup, status] = page.sections
    expect(setup.hideLabel).toBe(true)
    expect(setup.label).toBeUndefined()
    expect(setup.columns).toHaveLength(1)
    expect(setup.columns[0].widgets.map((w) => w.type)).toEqual(['core/setup-checklist'])
    expect(setup.columns[0].widgets[0].config).toEqual({ variant: 'full' })

    expect(status.columns).toHaveLength(3)
    expect(allWidgets(layout).map((w) => w.type)).toEqual([
      'core/setup-checklist',
      'core/site-status',
      'core/storage',
      'core/publication-stats',
    ])

    const ids = allWidgets(layout).map((w) => w.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('with seeds adds quick-draft, content and media sections bound to the first seed', () => {
    const layout = generateDefaultDashboardLayout(
      [seedStub('pagine'), seedStub('prodotti')],
      { newId: sequentialIds() },
    )

    const page = layout.pages[0]
    expect(page.sections).toHaveLength(4)
    expect(page.sections[1].columns).toHaveLength(4)
    expect(allWidgets(layout).map((w) => w.type)).toContain('core/quick-draft')

    // Quick-draft carries no seed list — widgets fetch their own data.
    const quickDraft = allWidgets(layout).find((w) => w.type === 'core/quick-draft')
    expect(quickDraft?.config).toEqual({ variant: 'minimal' })

    const seedBound = allWidgets(layout).filter((w) => 'seedSlug' in w.config)
    expect(seedBound.map((w) => w.type).sort()).toEqual([
      'core/activity-feed',
      'core/media-gallery',
      'core/pending-drafts',
      'core/recent-content',
    ])
    for (const w of seedBound) expect(w.config['seedSlug']).toBe('pagine')

    expect(page.sections[2].columnSpans).toEqual([6, 6])
    expect(page.sections[3].columnSpans).toEqual([6, 6])

    const ids = allWidgets(layout).map((w) => w.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("prefers the 'articoli' seed when present", () => {
    const layout = generateDefaultDashboardLayout(
      [seedStub('pagine'), seedStub('articoli')],
      { newId: sequentialIds() },
    )

    const seedBound = allWidgets(layout).filter((w) => 'seedSlug' in w.config)
    expect(seedBound).toHaveLength(4)
    for (const w of seedBound) expect(w.config['seedSlug']).toBe('articoli')
  })

  it('output round-trips through dashboardLayoutSchema', () => {
    const seedLists: Seed[][] = [
      [],
      [seedStub('articoli')],
      [seedStub('pagine'), seedStub('prodotti')],
    ]
    for (const seeds of seedLists) {
      const layout = generateDefaultDashboardLayout(seeds, { newId: sequentialIds() })
      expect(dashboardLayoutSchema.parse(layout)).toEqual(layout)
    }
  })

  it('falls back to crypto.randomUUID when no id factory is injected', () => {
    const layout = generateDefaultDashboardLayout([seedStub('articoli')])
    const ids = allWidgets(layout).map((w) => w.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(dashboardLayoutSchema.parse(layout)).toEqual(layout)
  })
})

// ---------------------------------------------------------------------------
// validateDashboardLayout
// ---------------------------------------------------------------------------

describe('validateDashboardLayout', () => {
  it('strips widgets whose config.seedSlug references a missing seed', () => {
    const layout = singleSectionLayout([
      [widget('w-1', 'core/site-status', { variant: 'badge' })],
      [
        widget('w-2', 'core/recent-content', { seedSlug: 'articoli' }),
        widget('w-3', 'core/pending-drafts', { seedSlug: 'ghost' }),
      ],
    ])

    const res = validateDashboardLayout(layout, ctx)

    expect(res.ok).toBe(true)
    expect(res.warnings).toHaveLength(1)
    expect(res.warnings[0]).toContain('ghost')
    expect(allWidgets(res.cleaned).map((w) => w.id)).toEqual(['w-1', 'w-2'])
  })

  it('keeps a freshly added widget whose seedSlug is still an empty placeholder', () => {
    const layout = singleSectionLayout([
      [widget('w-1', 'core/site-status', { variant: 'badge' })],
      [widget('w-2', 'core/recent-content', { seedSlug: '', variant: 'list' })],
    ])

    const res = validateDashboardLayout(layout, ctx)

    expect(res.ok).toBe(true)
    expect(res.warnings).toHaveLength(0)
    expect(allWidgets(res.cleaned).map((w) => w.id)).toEqual(['w-1', 'w-2'])
  })

  it('rejects duplicate widget ids', () => {
    const layout = singleSectionLayout([
      [widget('w-1', 'core/site-status')],
      [widget('w-1', 'core/storage')],
    ])

    const res = validateDashboardLayout(layout, ctx)

    expect(res.ok).toBe(false)
    if (res.ok) throw new Error('expected ok: false')
    expect(res.errors).toHaveLength(1)
    expect(res.errors[0]).toContain("Widget id 'w-1' appears more than once")
  })

  it('rejects duplicate page slugs', () => {
    const layout: DashboardLayout = {
      version: 1,
      pages: [
        singleSectionLayout([[widget('w-1', 'core/site-status')]]).pages[0],
        {
          id: 'p-2',
          slug: 'overview',
          label: 'Overview bis',
          sections: [
            { id: 's-2', columns: [{ id: 'c-9', widgets: [widget('w-2', 'core/storage')] }] },
          ],
        },
      ],
    }

    const res = validateDashboardLayout(layout, ctx)

    expect(res.ok).toBe(false)
    if (res.ok) throw new Error('expected ok: false')
    expect(res.errors).toHaveLength(1)
    expect(res.errors[0]).toContain("Page slug 'overview' appears more than once")
  })

  it('rejects columnSpans that do not sum to 12', () => {
    const layout = singleSectionLayout(
      [[widget('w-1', 'core/site-status')], [widget('w-2', 'core/storage')]],
      [6, 5],
    )

    const res = validateDashboardLayout(layout, ctx)

    expect(res.ok).toBe(false)
    if (res.ok) throw new Error('expected ok: false')
    expect(res.errors).toHaveLength(1)
    expect(res.errors[0]).toContain('columnSpans must sum to 12, got 11')
  })

  it('rejects columnSpans whose length differs from the column count', () => {
    const layout = singleSectionLayout(
      [[widget('w-1', 'core/site-status')], [widget('w-2', 'core/storage')]],
      [6, 6, 6],
    )

    const res = validateDashboardLayout(layout, ctx)

    expect(res.ok).toBe(false)
    if (res.ok) throw new Error('expected ok: false')
    expect(res.errors).toHaveLength(1)
    expect(res.errors[0]).toContain('columnSpans has 3 entries for 2 columns')
  })

  it('rejects a widget config larger than 8 KB once serialized', () => {
    const layout = singleSectionLayout([
      [widget('w-1', 'core/site-status', { blob: 'x'.repeat(MAX_WIDGET_CONFIG_BYTES) })],
    ])

    const res = validateDashboardLayout(layout, ctx)

    expect(res.ok).toBe(false)
    if (res.ok) throw new Error('expected ok: false')
    expect(res.errors).toHaveLength(1)
    expect(res.errors[0]).toContain(`config exceeds ${MAX_WIDGET_CONFIG_BYTES} bytes`)
  })

  it('measures the widget config cap in UTF-8 bytes, not UTF-16 characters', () => {
    // 3000 euro signs serialize to ~3008 UTF-16 chars but 9008 UTF-8 bytes (3 bytes each).
    const layout = singleSectionLayout([
      [widget('w-1', 'core/site-status', { blob: '€'.repeat(3000) })],
    ])

    const res = validateDashboardLayout(layout, ctx)

    expect(res.ok).toBe(false)
    if (res.ok) throw new Error('expected ok: false')
    expect(res.errors).toHaveLength(1)
    expect(res.errors[0]).toContain(`config exceeds ${MAX_WIDGET_CONFIG_BYTES} bytes`)
  })

  it('warns about unknown widget types without stripping them', () => {
    const layout = singleSectionLayout([
      [widget('w-1', 'core/site-status'), widget('w-2', '@acme/weather')],
    ])

    const res = validateDashboardLayout(layout, {
      ...ctx,
      knownWidgetTypes: new Set(['core/site-status']),
    })

    expect(res.ok).toBe(true)
    expect(res.warnings).toHaveLength(1)
    expect(res.warnings[0]).toContain('@acme/weather')
    expect(allWidgets(res.cleaned).map((w) => w.id)).toEqual(['w-1', 'w-2'])
  })

  it('returns the cleaned layout (cleanup applied) even when validation fails', () => {
    const layout = singleSectionLayout([
      [widget('w-1', 'core/site-status'), widget('w-1', 'core/storage')],
      [widget('w-3', 'core/recent-content', { seedSlug: 'ghost' })],
    ])

    const res = validateDashboardLayout(layout, ctx)

    expect(res.ok).toBe(false)
    expect(res.warnings).toHaveLength(1)
    expect(allWidgets(res.cleaned).map((w) => w.id)).toEqual(['w-1', 'w-1'])
  })
})

// ---------------------------------------------------------------------------
// Tab audience (page.roles)
// ---------------------------------------------------------------------------

const ROLE_A = '3f2b8c1e-5a4d-4e7b-9c60-1d2e3f4a5b6c'
const ROLE_B = '7a9d0e2f-1b3c-4d5e-8f6a-0b1c2d3e4f5a'

function layoutWithPageRoles(roles: string[]): DashboardLayout {
  const layout = singleSectionLayout([[widget('w-1', 'core/site-status')]])
  layout.pages[0].roles = roles
  return layout
}

describe('dashboardPageSchema roles', () => {
  it('accepts a roles array of UUID strings', () => {
    const layout = layoutWithPageRoles([ROLE_A, ROLE_B])

    const res = dashboardLayoutSchema.safeParse(layout)

    expect(res.success).toBe(true)
  })

  it('rejects more roles than the per-page cap', () => {
    const roles = Array.from({ length: MAX_ROLES_PER_PAGE + 1 }, (_, i) => `role-${i}`)

    const res = dashboardLayoutSchema.safeParse(layoutWithPageRoles(roles))

    expect(res.success).toBe(false)
  })

  it('rejects an empty-string role id', () => {
    const res = dashboardLayoutSchema.safeParse(layoutWithPageRoles(['']))

    expect(res.success).toBe(false)
  })
})

describe('validateDashboardLayout roleIds', () => {
  const ctx: DashboardLayoutContext = { seedSlugs: new Set() }

  it('errors on an unknown role id naming the page slug and the id, and keeps roles intact', () => {
    const layout = layoutWithPageRoles([ROLE_A, ROLE_B])

    const res = validateDashboardLayout(layout, { ...ctx, roleIds: new Set([ROLE_A]) })

    expect(res).toMatchObject({
      ok: false,
      errors: [`Page 'overview': unknown role id '${ROLE_B}'.`],
    })
    expect(res.cleaned.pages[0].roles).toEqual([ROLE_A, ROLE_B])
  })

  it('accepts an unknown role id with no error and no warning when roleIds is absent', () => {
    const layout = layoutWithPageRoles([ROLE_A])

    const res = validateDashboardLayout(layout, ctx)

    expect(res.ok).toBe(true)
    expect(res.warnings).toEqual([])
    expect(res.cleaned.pages[0].roles).toEqual([ROLE_A])
  })

  it('returns ok when roleIds contains every listed id', () => {
    const layout = layoutWithPageRoles([ROLE_A, ROLE_B])

    const res = validateDashboardLayout(layout, { ...ctx, roleIds: new Set([ROLE_A, ROLE_B]) })

    expect(res.ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// dashboardLayoutSchema — aggregate size limits
// ---------------------------------------------------------------------------

describe('dashboardLayoutSchema', () => {
  it('rejects a layout whose serialized size exceeds the aggregate cap', () => {
    // 40 max-size configs stay under every count cap but pass the 256 KB total.
    const widgets = Array.from({ length: 40 }, (_, i) =>
      widget(`w-${i}`, 'core/site-status', { blob: 'x'.repeat(MAX_WIDGET_CONFIG_BYTES - 20) }),
    )
    const layout = singleSectionLayout([widgets])

    const res = dashboardLayoutSchema.safeParse(layout)

    expect(JSON.stringify(layout).length).toBeGreaterThan(MAX_DASHBOARD_LAYOUT_BYTES)
    expect(res.success).toBe(false)
  })

  it('rejects more widgets in a column than the per-column cap', () => {
    const widgets = Array.from({ length: MAX_WIDGETS_PER_COLUMN + 1 }, (_, i) =>
      widget(`w-${i}`, 'core/site-status'),
    )

    const res = dashboardLayoutSchema.safeParse(singleSectionLayout([widgets]))

    expect(res.success).toBe(false)
  })

  it('rejects more sections in a page than the per-page cap', () => {
    const layout = singleSectionLayout([[]])
    const section = layout.pages[0].sections[0]
    layout.pages[0].sections = Array.from({ length: MAX_SECTIONS_PER_PAGE + 1 }, (_, i) => ({
      ...section,
      id: `s-${i}`,
    }))

    const res = dashboardLayoutSchema.safeParse(layout)

    expect(res.success).toBe(false)
  })

  it('rejects an id string longer than the id cap', () => {
    const layout = singleSectionLayout([[widget('w'.repeat(10_000), 'core/site-status')]])

    const res = dashboardLayoutSchema.safeParse(layout)

    expect(res.success).toBe(false)
  })

  it('accepts the generated default layout', () => {
    const layout = generateDefaultDashboardLayout([seedStub('articoli')])

    expect(dashboardLayoutSchema.safeParse(layout).success).toBe(true)
  })
})
