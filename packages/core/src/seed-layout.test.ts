// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { seedViewConfigSchema, kanbanViewConfigSchema, validateLayoutAgainstSeed, validateCardConfigAgainstSeed, METADATA_SLOT_CAP } from './seed-layout.js'

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

describe('seedViewConfigSchema', () => {
  it('accepts a full seed view config', () => {
    const result = seedViewConfigSchema.safeParse({
      kanban: { axisBranchId: 'br_01', sort: null },
    })
    expect(result.success).toBe(true)
  })

  it('accepts empty object (no view configured)', () => {
    expect(seedViewConfigSchema.safeParse({}).success).toBe(true)
  })

  it('accepts additional unknown keys (passthrough)', () => {
    const result = seedViewConfigSchema.safeParse({ kanban: { axisBranchId: null, sort: null }, future: 42 })
    expect(result.success).toBe(true)
    if (result.success) expect((result.data as Record<string, unknown>).future).toBe(42)
  })

  it('rejects invalid kanban sub-object', () => {
    const result = seedViewConfigSchema.safeParse({ kanban: { axisBranchId: 123, sort: null } })
    expect(result.success).toBe(false)
  })
})

describe('seedViewConfigSchema — card extension', () => {
  it('accepts card config alongside kanban', () => {
    const result = seedViewConfigSchema.safeParse({
      kanban: { axisBranchId: 'br_01', sort: null },
      card: { version: 1, header: { branchId: 'br_01' }, subtitle: { branchId: 'br_02' }, metadata: [] },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.kanban?.axisBranchId).toBe('br_01')
      expect(result.data.card?.header?.branchId).toBe('br_01')
    }
  })

  it('accepts omitted card key', () => {
    expect(seedViewConfigSchema.safeParse({ kanban: { axisBranchId: null, sort: null } }).success).toBe(true)
  })

  it('rejects card with invalid branchId format', () => {
    const result = seedViewConfigSchema.safeParse({
      card: { version: 1, header: { branchId: 'not-a-branch-id' }, metadata: [] },
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
})

