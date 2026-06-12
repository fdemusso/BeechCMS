// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, expect, it } from 'vitest'
import type { Seed } from './types.js'
import {
  MAX_WIDGET_CONFIG_BYTES,
  dashboardLayoutSchema,
  generateDefaultDashboardLayout,
  validateDashboardLayout,
  type DashboardLayout,
  type DashboardLayoutContext,
  type DashboardWidgetInstance,
} from './dashboard-layout.js'
import {
  ROLES_ALLOWED_TO_EDIT_DASHBOARD,
  canEditDashboard,
} from './dashboard-permissions.js'

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
// dashboard-permissions
// ---------------------------------------------------------------------------

describe('canEditDashboard', () => {
  it('allows only the configured roles', () => {
    expect(ROLES_ALLOWED_TO_EDIT_DASHBOARD).toContain('admin')
    expect(canEditDashboard('admin')).toBe(true)
    expect(canEditDashboard('editor')).toBe(false)
    expect(canEditDashboard('')).toBe(false)
    expect(canEditDashboard(undefined)).toBe(false)
    expect(canEditDashboard(null)).toBe(false)
  })
})
