// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { defineSeed } from '../engine/seeds/define-seed.js'
import {
  kanbanViewConfigSchema,
  kanbanCardConfigSchema,
  validateLayoutAgainstSeed,
  validateCardConfigAgainstSeed,
  generateDefaultLayout,
  METADATA_SLOT_CAP,
  type LayoutField,
} from './seed-layout.js'

describe('kanbanViewConfigSchema', () => {
  it('accepts a valid config', () => {
    const result = kanbanViewConfigSchema.safeParse({
      axisBranchId: 'br_01',
      sort: { branchId: 'br_02', dir: 'ASC' },
      hiddenColumnValues: ['x'],
      collapsedColumnValues: ['y'],
    })
    expect(result.success).toBe(true)
  })

  it('accepts null axisBranchId and null sort', () => {
    const result = kanbanViewConfigSchema.safeParse({ axisBranchId: null, sort: null })
    expect(result.success).toBe(true)
  })

  it('accepts missing optional fields', () => {
    const result = kanbanViewConfigSchema.safeParse({ axisBranchId: 'br_01', sort: null })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.hiddenColumnValues).toBeUndefined()
      expect(result.data.collapsedColumnValues).toBeUndefined()
    }
  })

  it('rejects invalid sort dir', () => {
    const result = kanbanViewConfigSchema.safeParse({
      axisBranchId: null,
      sort: { branchId: 'br_01', dir: 'INVALID' },
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing required fields', () => {
    expect(kanbanViewConfigSchema.safeParse({}).success).toBe(false)
    expect(kanbanViewConfigSchema.safeParse({ axisBranchId: 'br_01' }).success).toBe(false)
  })
})

describe('kanbanCardConfigSchema', () => {
  it('accepts a card whose slots reference Branch IDs', () => {
    const result = kanbanCardConfigSchema.safeParse({
      version: 1, header: { branchId: 'br_01' }, subtitle: { branchId: 'br_02' }, metadata: [],
    })

    expect(result.success).toBe(true)
  })

  it('rejects a slot that references an alias instead of a Branch ID', () => {
    const result = kanbanCardConfigSchema.safeParse({
      version: 1, header: { branchId: 'not-a-branch-id' }, metadata: [],
    })

    expect(result.success).toBe(false)
  })
})

describe('validateCardConfigAgainstSeed', () => {
  const mockSeed = {
    slug: 'tasks',
    label: 'Tasks',
    displayNameAlias: 'title',
    branches: [
      { id: 'br_01', alias: 'title', type: 'text', label: 'Title' },
      { id: 'br_02', alias: 'status', type: 'text', label: 'Status' },
      { id: 'br_03', alias: 'body', type: 'richtext', label: 'Body' },
      { id: 'br_04', alias: 'data', type: 'json', label: 'Data' },
      { id: 'br_05', alias: 'items', type: 'repeater', label: 'Items' },
      { id: 'br_06', alias: 'due', type: 'date', label: 'Due' },
      { id: 'br_07', alias: 'count', type: 'number', label: 'Count' },
      { id: 'br_08', alias: 'done', type: 'boolean', label: 'Done' },
      { id: 'br_09', alias: 'file', type: 'file', label: 'File' },
    ],
  } as any

  it('strips a branchId absent from seed', () => {
    const result = validateCardConfigAgainstSeed(
      { version: 1, header: { branchId: 'br_99' }, metadata: [] },
      mockSeed,
    )
    expect(result.ok).toBe(true)
    expect(result.cleaned.header).toBeNull()
  })

  it('strips richtext branch from all slots', () => {
    const result = validateCardConfigAgainstSeed(
      { version: 1, header: { branchId: 'br_03' }, subtitle: { branchId: 'br_01' }, metadata: [] },
      mockSeed,
    )
    expect(result.ok).toBe(true)
    expect(result.cleaned.header).toBeNull()
    expect(result.cleaned.subtitle?.branchId).toBe('br_01')
  })

  it('strips json branch', () => {
    const result = validateCardConfigAgainstSeed(
      { version: 1, header: { branchId: 'br_04' }, metadata: [] },
      mockSeed,
    )
    expect(result.cleaned.header).toBeNull()
  })

  it('strips repeater branch', () => {
    const result = validateCardConfigAgainstSeed(
      { version: 1, header: { branchId: 'br_05' }, metadata: [] },
      mockSeed,
    )
    expect(result.cleaned.header).toBeNull()
  })

  it('strips system alias branch', () => {
    const result = validateCardConfigAgainstSeed(
      { version: 1, header: { branchId: 'br_02' }, metadata: [] },
      mockSeed,
    )
    // br_02 alias is 'status' which is a SYSTEM_ALIAS
    expect(result.cleaned.header).toBeNull()
  })

  it('truncates metadata beyond METADATA_SLOT_CAP and reports error', () => {
    const metadata = ['br_01', 'br_06', 'br_07', 'br_08', 'br_09', 'br_03', 'br_05']
      .slice(0, METADATA_SLOT_CAP + 1)
      .map((id) => ({ branchId: id }))
    // Use only eligible branches so truncation is due to cap not eligibility
    const capMetadata = [
      { branchId: 'br_01' }, { branchId: 'br_06' }, { branchId: 'br_07' },
      { branchId: 'br_08' }, { branchId: 'br_09' },
    ]
    // Add 2 more eligible-ish (non-system, non-forbidden) — but we only have br_01..br_09
    // br_02 is system alias, br_03 richtext, br_04 json, br_05 repeater
    // So max eligible for metadata from this seed: br_01, br_06, br_07, br_08, br_09 = 5, under cap
    // To test cap, build a seed with 7 eligible branches
    const bigSeed = {
      ...mockSeed,
      branches: Array.from({ length: 8 }, (_, i) => ({
        id: `br_${String(i + 1).padStart(2, '0')}`,
        alias: `field${i + 1}`,
        type: 'text',
        label: `Field ${i + 1}`,
      })),
    }
    const overCapMetadata = bigSeed.branches.map((b: { id: string }) => ({ branchId: b.id }))
    const result = validateCardConfigAgainstSeed(
      { version: 1, metadata: overCapMetadata },
      bigSeed,
    )
    expect(result.ok).toBe(false)
    expect(result.cleaned.metadata).toHaveLength(METADATA_SLOT_CAP)
    expect(result.errors.some((e: string) => e.includes('cap'))).toBe(true)
  })

  it('rejects same branch in two slots with error', () => {
    const result = validateCardConfigAgainstSeed(
      { version: 1, header: { branchId: 'br_01' }, subtitle: { branchId: 'br_01' }, metadata: [] },
      mockSeed,
    )
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('br_01'))).toBe(true)
    expect(result.cleaned.header?.branchId).toBe('br_01')
    expect(result.cleaned.subtitle).toBeNull()
  })

  it('returns ok:true for valid config', () => {
    const result = validateCardConfigAgainstSeed(
      { version: 1, header: { branchId: 'br_01' }, metadata: [{ branchId: 'br_06' }] },
      mockSeed,
    )
    expect(result.ok).toBe(true)
  })
})

describe('validateLayoutAgainstSeed', () => {
  const mockSeed = {
    slug: 'tasks',
    label: 'Tasks',
    displayNameAlias: 'title',
    branches: [
      { id: 'br_01', alias: 'title', type: 'text', label: 'Title' },
      { id: 'br_02', alias: 'description', type: 'richtext', label: 'Description' }
    ]
  } as any

  it('validates a correct form layout', () => {
    const validLayout = {
      version: 1,
      tabs: [
        {
          id: 'tab-1',
          label: 'Info',
          sections: [
            {
              id: 'sec-1',
              columns: [
                {
                  id: 'col-1',
                  fields: [{ branchId: 'br_01' }]
                }
              ]
            }
          ]
        }
      ]
    } as any

    const result = validateLayoutAgainstSeed(validLayout, mockSeed)
    expect(result.ok).toBe(true)
    expect(result.cleaned.tabs[0].sections[0].columns[0].fields).toHaveLength(1)
  })

  it('gracefully handles empty layout and returns generated default layout', () => {
    const emptyLayout = {} as any
    const result = validateLayoutAgainstSeed(emptyLayout, mockSeed)
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toContain('Invalid layout structure')
    expect(result.cleaned.tabs).toBeDefined()
    expect(result.cleaned.tabs.length).toBeGreaterThan(0)
  })

  it('gracefully handles missing tab fields or columns', () => {
    const corruptLayout = {
      version: 1,
      tabs: [
        {
          id: 'tab-1',
          label: 'Info'
          // missing sections
        }
      ]
    } as any
    const result = validateLayoutAgainstSeed(corruptLayout, mockSeed)
    expect(result.ok).toBe(true) // will filter down cleanly using default empty arrays
    expect(result.cleaned.tabs[0].sections).toEqual([])
  })

  it('validates a correct form layout containing a single-column dedicated json branch section', () => {
    const seedWithJson = {
      slug: 'configs',
      label: 'Configs',
      displayNameAlias: 'title',
      branches: [
        { id: 'br_01', alias: 'title', type: 'text', label: 'Title' },
        { id: 'br_02', alias: 'settings', type: 'json', label: 'Settings' },
      ],
    } as any

    const layout = {
      version: 1,
      tabs: [
        {
          id: 'tab-1',
          label: 'Data',
          sections: [
            {
              id: 'sec-1',
              columns: [{ id: 'col-1', fields: [{ branchId: 'br_01' }] }],
            },
            {
              id: 'sec-2',
              columns: [{ id: 'col-2', fields: [{ branchId: 'br_02' }] }],
            },
          ],
        },
      ],
    } as any

    const result = validateLayoutAgainstSeed(layout, seedWithJson)
    expect(result.ok).toBe(true)
    expect(result.cleaned.tabs[0].sections).toHaveLength(2)
  })

  it('rejects a json branch sharing a section with another branch', () => {
    const seedWithJson = {
      slug: 'configs',
      label: 'Configs',
      displayNameAlias: 'title',
      branches: [
        { id: 'br_01', alias: 'title', type: 'text', label: 'Title' },
        { id: 'br_02', alias: 'settings', type: 'json', label: 'Settings' },
      ],
    } as any

    const layout = {
      version: 1,
      tabs: [
        {
          id: 'tab-1',
          label: 'Data',
          sections: [
            {
              id: 'sec-1',
              columns: [
                { id: 'col-1', fields: [{ branchId: 'br_01' }, { branchId: 'br_02' }] },
              ],
            },
          ],
        },
      ],
    } as any

    const result = validateLayoutAgainstSeed(layout, seedWithJson)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e: string) => e.includes('must occupy a dedicated section'))).toBe(true)
  })

  it('rejects a json branch section with multiple columns', () => {
    const seedWithJson = {
      slug: 'configs',
      label: 'Configs',
      displayNameAlias: 'title',
      branches: [
        { id: 'br_02', alias: 'settings', type: 'json', label: 'Settings' },
      ],
    } as any

    const layout = {
      version: 1,
      tabs: [
        {
          id: 'tab-1',
          label: 'Data',
          sections: [
            {
              id: 'sec-1',
              columns: [
                { id: 'col-1', fields: [{ branchId: 'br_02' }] },
                { id: 'col-2', fields: [] },
              ],
            },
          ],
        },
      ],
    } as any

    const result = validateLayoutAgainstSeed(layout, seedWithJson)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e: string) => e.includes('must occupy a single-column section'))).toBe(true)
  })
})

// @beechcms/testing depends on @beechcms/core, so core suites cannot import the canonical
// seeds; this seed mirrors canonical `posts`' branch types for the cover-image rule.
const COVER_SEED = defineSeed({
  slug: 'posts',
  label: 'Post',
  displayNameAlias: 'title',
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
    { id: 'br_02', alias: 'body', label: 'Body', type: 'richtext' },
    { id: 'br_03', alias: 'views', label: 'Views', type: 'number' },
    { id: 'br_04', alias: 'image', label: 'Image', type: 'file', fileOptions: { accept: 'image' } },
  ],
})

function makeIdCounter(): () => string {
  let n = 0
  return () => `id-${++n}`
}

function flattenFieldIds(sections: { columns: { fields: LayoutField[] }[] }[]): string[] {
  return sections.flatMap((s) => s.columns.flatMap((c) => c.fields.map((f) => f.branchId)))
}

describe('generateDefaultLayout', () => {
  it('generates a dedicated single-column full-width section for json branches', () => {
    const seedWithJson = {
      slug: 'configs',
      label: 'Configs',
      displayNameAlias: 'title',
      branches: [
        { id: 'br_01', alias: 'title', type: 'text', label: 'Title' },
        { id: 'br_02', alias: 'settings', type: 'json', label: 'Settings' },
        { id: 'br_03', alias: 'notes', type: 'text', label: 'Notes' },
      ],
    } as any

    const layout = generateDefaultLayout(seedWithJson)
    const dataTab = layout.tabs[0]
    expect(dataTab).toBeDefined()

    // br_02 should be in its own dedicated section with 1 column
    const jsonSection = dataTab.sections.find((s) =>
      s.columns.some((c) => c.fields.some((f) => f.branchId === 'br_02'))
    )
    expect(jsonSection).toBeDefined()
    expect(jsonSection?.columns).toHaveLength(1)
    expect(jsonSection?.columns[0].fields).toHaveLength(1)
    expect(jsonSection?.columns[0].fields[0].branchId).toBe('br_02')
  })

  it('places a single image file branch alone in the first section of the Data tab', () => {
    const layout = generateDefaultLayout(COVER_SEED, { newId: makeIdCounter() })
    const dataTab = layout.tabs[0]
    const coverSection = dataTab.sections[0]

    expect(coverSection.columns).toHaveLength(1)
    expect(coverSection.columns[0].fields).toHaveLength(1)
    expect(coverSection.columns[0].fields[0].branchId).toBe('br_04')
    expect(coverSection.hideLabel).toBe(true)
  })

  it('keeps every other main branch after the cover section, in seed order', () => {
    const layout = generateDefaultLayout(COVER_SEED, { newId: makeIdCounter() })
    const dataTab = layout.tabs[0]

    expect(flattenFieldIds(dataTab.sections.slice(1))).toEqual(['br_01', 'br_02', 'br_03'])
  })

  it('does not lift a file branch without accept \'image\'', () => {
    const seed = {
      ...COVER_SEED,
      branches: COVER_SEED.branches.map((b) => (b.id === 'br_04' ? { ...b, fileOptions: undefined } : b)),
    }

    const layout = generateDefaultLayout(seed, { newId: makeIdCounter() })
    const dataTab = layout.tabs[0]

    expect(dataTab.sections[0].columns.flatMap((c) => c.fields.map((f) => f.branchId))).not.toContain('br_04')
    const imageSection = dataTab.sections.find((s) => s.columns.some((c) => c.fields.some((f) => f.branchId === 'br_04')))
    expect(imageSection?.columns.length).toBeGreaterThan(1)
  })

  it('leaves the layout unchanged when two image file branches exist', () => {
    const seed = {
      ...COVER_SEED,
      branches: [
        ...COVER_SEED.branches,
        { id: 'br_05', alias: 'image2', label: 'Image 2', type: 'file', fileOptions: { accept: 'image' } },
      ],
    }

    const layout = generateDefaultLayout(seed, { newId: makeIdCounter() })
    const dataTab = layout.tabs[0]

    expect(dataTab.sections[0].columns.flatMap((c) => c.fields.map((f) => f.branchId))).not.toContain('br_04')
    const packedSection = dataTab.sections.find((s) => s.columns.some((c) => c.fields.some((f) => f.branchId === 'br_04')))
    expect(packedSection?.columns.some((c) => c.fields.some((f) => f.branchId === 'br_05'))).toBe(true)
  })

  it('does not treat a gallery file branch as a cover', () => {
    const seed = {
      ...COVER_SEED,
      branches: COVER_SEED.branches.map((b) => (b.id === 'br_04' ? { ...b, multiple: true } : b)),
    }

    const layout = generateDefaultLayout(seed, { newId: makeIdCounter() })
    const dataTab = layout.tabs[0]

    expect(dataTab.sections[0].columns.flatMap((c) => c.fields.map((f) => f.branchId))).not.toContain('br_04')
    const gallerySection = dataTab.sections.find((s) => s.columns.some((c) => c.fields.some((f) => f.branchId === 'br_04')))
    expect(gallerySection?.columns).toHaveLength(1)
    expect(gallerySection?.hideLabel).toBe(true)
  })

  it('does not add an empty placeholder section when the cover is the only main branch', () => {
    const seed = {
      ...COVER_SEED,
      branches: COVER_SEED.branches.filter((b) => b.id === 'br_04'),
    }

    const layout = generateDefaultLayout(seed, { newId: makeIdCounter() })

    expect(layout.tabs[0].sections).toHaveLength(1)
  })

  it('leaves an SEO image branch in the SEO tab', () => {
    const seed = {
      ...COVER_SEED,
      branches: COVER_SEED.branches.map((b) => (b.id === 'br_04' ? { ...b, alias: 'meta_image' } : b)),
    }

    const layout = generateDefaultLayout(seed, { newId: makeIdCounter() })
    const [dataTab, seoTab] = layout.tabs

    expect(flattenFieldIds(dataTab.sections)).not.toContain('br_04')
    expect(flattenFieldIds(seoTab.sections)).toContain('br_04')
  })

  it('produces a layout that validateLayoutAgainstSeed accepts', () => {
    const layout = generateDefaultLayout(COVER_SEED, { newId: makeIdCounter() })

    expect(validateLayoutAgainstSeed(layout, COVER_SEED).ok).toBe(true)
  })

  it('is deterministic for the same seed and id sequence', () => {
    const first = generateDefaultLayout(COVER_SEED, { newId: makeIdCounter() })
    const second = generateDefaultLayout(COVER_SEED, { newId: makeIdCounter() })

    expect(first).toEqual(second)
  })
})

