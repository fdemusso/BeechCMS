// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { findTagOption, isSingleChoiceTags, tagOptionValues, tagOptionsIssues } from './tag-options.js'
import type { Branch } from '../types.js'

const LOW_HIGH = [
  { value: 'low', color: '#64748b' },
  { value: 'high', color: '#ef4444' },
]

function tagsBranch(overrides: Record<string, unknown> = {}): Branch {
  return { id: 'br_01', alias: 'priority', label: 'Priority', type: 'tags', options: LOW_HIGH, ...overrides } as Branch
}

describe('isSingleChoiceTags', () => {
  it('is true only for tags with multiple false', () => {
    const matrix: Array<[Pick<Branch, 'type' | 'multiple'>, boolean]> = [
      [{ type: 'tags' }, false],
      [{ type: 'tags', multiple: true }, false],
      [{ type: 'tags', multiple: false }, true],
      [{ type: 'relation', multiple: false }, false],
    ]

    expect(matrix.map(([branch]) => isSingleChoiceTags(branch))).toEqual(matrix.map(([, expected]) => expected))
  })
})

describe('tagOptionValues', () => {
  it('returns values in declared order', () => {
    const values = tagOptionValues(tagsBranch({ options: [...LOW_HIGH].reverse() }))

    expect(values).toEqual(['high', 'low'])
  })

  it('returns [] without options', () => {
    const values = tagOptionValues({})

    expect(values).toEqual([])
  })
})

describe('findTagOption', () => {
  const branch = tagsBranch({ options: [{ value: 'pro', color: '#3b82f6' }] })

  it('returns the option for an exact value', () => {
    const found = findTagOption(branch, 'pro')

    expect(found?.color).toBe('#3b82f6')
  })

  it('returns undefined when only the case differs', () => {
    const found = findTagOption(branch, 'Pro')

    expect(found).toBeUndefined()
  })

  it('returns undefined when only the whitespace differs', () => {
    const found = findTagOption(branch, ' pro')

    expect(found).toBeUndefined()
  })
})

describe('tagOptionsIssues', () => {
  it('returns the expected message for each malformed seed', () => {
    const matrix: Array<[Branch, string[]]> = [
      [
        tagsBranch({ type: 'text' }),
        ["branch 'priority': options are not supported on type 'text'. Use type 'tags' with options (add multiple: false for a single choice)."],
      ],
      [
        tagsBranch({ type: 'number' }),
        ["branch 'priority': options are only supported on type 'tags' (got 'number')."],
      ],
      [
        tagsBranch({ options: [] }),
        ["branch 'priority': options must be a non-empty array of { value, color } objects."],
      ],
      [
        tagsBranch({ options: ['low'] }),
        ["branch 'priority': option #0 must be an object { value, color }, not a plain string."],
      ],
      [
        tagsBranch({ options: [LOW_HIGH[0], LOW_HIGH[0]] }),
        ["branch 'priority': duplicate option value 'low'."],
      ],
      [
        tagsBranch({ options: [{ value: 'low', color: 'red' }] }),
        ["branch 'priority': option 'low' color must be a hex color #RRGGBB (got 'red')."],
      ],
      [
        tagsBranch({ options: [{ value: 'low', color: '#fff' }] }),
        ["branch 'priority': option 'low' color must be a hex color #RRGGBB (got '#fff')."],
      ],
      [
        tagsBranch({ options: [{ value: 'low' }] }),
        ["branch 'priority': option 'low' color must be a hex color #RRGGBB (got 'undefined')."],
      ],
      [
        tagsBranch({ options: [{ value: ' pro', color: '#3b82f6' }] }),
        ["branch 'priority': option #0 value must be a non-empty string without leading or trailing whitespace."],
      ],
      [
        tagsBranch({ multiple: 'yes' }),
        ["branch 'priority': multiple must be a boolean."],
      ],
      [
        { id: 'br_09', alias: 'items', label: 'Items', type: 'repeater', fields: [tagsBranch({ type: 'text', alias: 'kind' })] } as Branch,
        ["branch 'items': sub-field 'kind': options are not supported on type 'text'. Use type 'tags' with options (add multiple: false for a single choice)."],
      ],
    ]

    expect(matrix.map(([branch]) => tagOptionsIssues(branch))).toEqual(matrix.map(([, expected]) => expected))
  })

  it('collects every issue of a single option entry', () => {
    const issues = tagOptionsIssues(tagsBranch({ options: [{ value: '', color: 'red' }] }))

    expect(issues).toEqual([
      "branch 'priority': option #0 value must be a non-empty string without leading or trailing whitespace.",
      "branch 'priority': option #0 color must be a hex color #RRGGBB (got 'red').",
    ])
  })

  it('returns [] for valid single, multiple and free tags', () => {
    const branches = [tagsBranch({ multiple: false }), tagsBranch({ multiple: true }), tagsBranch({ options: undefined })]

    expect(branches.map((branch) => tagOptionsIssues(branch))).toEqual([[], [], []])
  })
})
