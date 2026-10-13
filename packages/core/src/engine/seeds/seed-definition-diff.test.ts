// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { diffSeedDefinition, normalizeBranchDefinition } from './seed-definition-diff.js'
import type { Branch, Seed } from '../types.js'

// Hand-built fixtures: core tests cannot import @beechcms/testing (circular dependency, see content-view.test.ts).
const PRIORITY_OPTIONS = [
  { value: 'low', color: '#64748b' },
  { value: 'high', color: '#ef4444' },
]

function postsSeed(branchOverrides: Record<string, Partial<Branch>> = {}, seedOverrides: Partial<Seed> = {}): Seed {
  const branches: Branch[] = [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
    { id: 'br_07', alias: 'labels', label: 'Labels', type: 'tags' },
    { id: 'br_11', alias: 'priority', label: 'Priority', type: 'tags', multiple: false, options: PRIORITY_OPTIONS },
  ]
  return {
    slug: 'posts',
    label: 'Post',
    displayNameAlias: 'title',
    branches: branches.map(branch => ({ ...branch, ...branchOverrides[branch.id] })),
    ...seedOverrides,
  }
}

describe('normalizeBranchDefinition', () => {
  it('drops the id from the branch and its repeater sub-fields and materializes omitted required flags as false', () => {
    const repeater = {
      id: 'br_20',
      alias: 'items',
      label: 'Items',
      type: 'repeater',
      fields: [{ id: 'br_21', alias: 'name', label: 'Name', type: 'text' }],
    } as Branch

    const normalized = normalizeBranchDefinition(repeater)

    expect(normalized).toMatchObject({ requiredOnCreate: false, requiredOnUpdate: false })
    expect(normalized).not.toHaveProperty('id')
    expect(normalized.fields).toEqual([
      { alias: 'name', label: 'Name', type: 'text', requiredOnCreate: false, requiredOnUpdate: false, multiple: false },
    ])
  })

  it('resolves multiple as true for tags unless explicitly false and as false for relation unless explicitly true', () => {
    const matrix: Array<[Partial<Branch>, boolean]> = [
      [{ type: 'tags' }, true],
      [{ type: 'tags', multiple: true }, true],
      [{ type: 'tags', multiple: false }, false],
      [{ type: 'relation' }, false],
      [{ type: 'relation', multiple: true }, true],
    ]

    const resolved = matrix.map(([branch]) => normalizeBranchDefinition({ alias: 'x', label: 'X', ...branch } as Branch).multiple)

    expect(resolved).toEqual(matrix.map(([, expected]) => expected))
  })

  it('copies an unknown key and the options array unchanged', () => {
    const branch = { ...postsSeed().branches[2], futureKey: { nested: 1 } } as Branch

    const normalized = normalizeBranchDefinition(branch)

    expect(normalized.futureKey).toEqual({ nested: 1 })
    expect(normalized.options).toEqual(PRIORITY_OPTIONS)
  })
})

describe('diffSeedDefinition', () => {
  it('returns changed true and no branches when nothing is stored', () => {
    const diff = diffSeedDefinition(null, postsSeed())

    expect(diff).toEqual({ changed: true, changedBranches: [] })
  })

  it('returns changed false for two identical definitions with keys in a different order', () => {
    const reordered = postsSeed()
    reordered.branches = reordered.branches.map(branch => Object.fromEntries(Object.entries(branch).reverse()) as unknown as Branch)

    const diff = diffSeedDefinition(postsSeed(), reordered)

    expect(diff).toEqual({ changed: false, changedBranches: [] })
  })

  it('reports priority when only an option color changes', () => {
    const recolored = [{ value: 'low', color: '#64748b' }, { value: 'high', color: '#dc2626' }]

    const diff = diffSeedDefinition(postsSeed(), postsSeed({ br_11: { options: recolored } }))

    expect(diff).toEqual({ changed: true, changedBranches: ['priority'] })
  })

  it('reports priority when two options are reordered', () => {
    const diff = diffSeedDefinition(postsSeed(), postsSeed({ br_11: { options: [...PRIORITY_OPTIONS].reverse() } }))

    expect(diff.changedBranches).toEqual(['priority'])
  })

  it('reports priority when multiple false is removed from a tags branch', () => {
    const diff = diffSeedDefinition(postsSeed(), postsSeed({ br_11: { multiple: undefined } }))

    expect(diff.changedBranches).toEqual(['priority'])
  })

  it('reports nothing when multiple true is added explicitly to a tags branch that omitted it', () => {
    const diff = diffSeedDefinition(postsSeed(), postsSeed({ br_07: { multiple: true } }))

    expect(diff).toEqual({ changed: false, changedBranches: [] })
  })

  it('reports nothing when requiredOnCreate false is added to a branch that omitted it', () => {
    const diff = diffSeedDefinition(postsSeed(), postsSeed({ br_07: { requiredOnCreate: false } }))

    expect(diff).toEqual({ changed: false, changedBranches: [] })
  })

  it('lists the alias of a new branch in candidate order', () => {
    const candidate = postsSeed()
    candidate.branches.push({ id: 'br_12', alias: 'summary', label: 'Summary', type: 'text' })

    const diff = diffSeedDefinition(postsSeed(), candidate)

    expect(diff).toEqual({ changed: true, changedBranches: ['summary'] })
  })

  it('returns changed true with no branches when only the seed label changes', () => {
    const diff = diffSeedDefinition(postsSeed(), postsSeed({}, { label: 'Article' }))

    expect(diff).toEqual({ changed: true, changedBranches: [] })
  })

  it('ignores a layout present on one side only', () => {
    const withLayout = { ...postsSeed(), layout: { sections: [] } } as Seed

    const diff = diffSeedDefinition(postsSeed(), withLayout)

    expect(diff).toEqual({ changed: false, changedBranches: [] })
  })

  it('pairs branches by id: the same alias under a different id is reported as new', () => {
    const candidate = postsSeed()
    candidate.branches[2] = { ...candidate.branches[2], id: 'br_99' }

    const diff = diffSeedDefinition(postsSeed(), candidate)

    expect(diff.changedBranches).toEqual(['priority'])
  })
})
