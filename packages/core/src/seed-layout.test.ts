// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { seedViewConfigSchema, kanbanViewConfigSchema, validateLayoutAgainstSeed } from './seed-layout.js'

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

