// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, expect, it } from 'vitest'
import { defineSeed } from '../engine/define-seed.js'
import type { Branch, BranchType } from '../engine/types.js'
import { checkFormatCompatibility, isFlatSeed, nonFlatBranches } from './flat-seed.js'

function seedWithBranch(branch: Branch) {
  return defineSeed({
    slug: 'fixture',
    label: 'Fixture',
    displayNameAlias: 'name',
    branches: [
      { id: 'br_01', alias: 'name', label: 'Name', type: 'text', requiredOnCreate: true },
      branch,
    ],
  })
}

describe('isFlatSeed', () => {
  it('is true for a seed whose every branch is a scalar', () => {
    const seed = seedWithBranch({ id: 'br_02', alias: 'count', label: 'Count', type: 'number' })

    const result = isFlatSeed(seed)

    expect(result).toBe(true)
  })

  const nonFlatCases: Array<{ type: BranchType; multiple?: boolean }> = [
    { type: 'relation' },
    { type: 'repeater' },
    { type: 'tags' },
    { type: 'json' },
    { type: 'file', multiple: true },
  ]

  it.each(nonFlatCases)('is false when a branch is $type (multiple: $multiple)', ({ type, multiple }) => {
    const seed = seedWithBranch({ id: 'br_02', alias: 'offender', label: 'Offender', type, multiple })

    const result = isFlatSeed(seed)

    expect(result).toBe(false)
  })

  it('is true for a plain single file branch', () => {
    const seed = seedWithBranch({ id: 'br_02', alias: 'avatar', label: 'Avatar', type: 'file' })

    const result = isFlatSeed(seed)

    expect(result).toBe(true)
  })
})

describe('nonFlatBranches', () => {
  it('names every offending branch alias in declaration order', () => {
    const seed = defineSeed({
      slug: 'fixture',
      label: 'Fixture',
      displayNameAlias: 'name',
      branches: [
        { id: 'br_01', alias: 'name', label: 'Name', type: 'text', requiredOnCreate: true },
        { id: 'br_02', alias: 'gallery', label: 'Gallery', type: 'file', multiple: true },
        { id: 'br_03', alias: 'labels', label: 'Labels', type: 'tags' },
      ],
    })

    const result = nonFlatBranches(seed)

    expect(result.map((branch) => branch.alias)).toEqual(['gallery', 'labels'])
  })
})

describe('checkFormatCompatibility', () => {
  it('is compatible with ndjson for a seed carrying every non-flat branch type', () => {
    const seed = defineSeed({
      slug: 'fixture',
      label: 'Fixture',
      displayNameAlias: 'name',
      branches: [
        { id: 'br_01', alias: 'name', label: 'Name', type: 'text', requiredOnCreate: true },
        { id: 'br_02', alias: 'gallery', label: 'Gallery', type: 'file', multiple: true },
        { id: 'br_03', alias: 'labels', label: 'Labels', type: 'tags' },
        { id: 'br_04', alias: 'blocks', label: 'Blocks', type: 'repeater' },
      ],
    })

    const result = checkFormatCompatibility(seed, 'ndjson')

    expect(result).toEqual({ compatible: true })
  })

  it('refuses csv for a relational seed and names every offending alias', () => {
    const seed = defineSeed({
      slug: 'fixture',
      label: 'Fixture',
      displayNameAlias: 'name',
      branches: [
        { id: 'br_01', alias: 'name', label: 'Name', type: 'text', requiredOnCreate: true },
        { id: 'br_02', alias: 'gallery', label: 'Gallery', type: 'file', multiple: true },
        { id: 'br_03', alias: 'labels', label: 'Labels', type: 'tags' },
      ],
    })

    const result = checkFormatCompatibility(seed, 'csv')

    expect(result).toEqual({
      compatible: false,
      code: 'csv_requires_flat_seed',
      offendingBranches: [
        { alias: 'gallery', type: 'file' },
        { alias: 'labels', type: 'tags' },
      ],
    })
  })
})
