// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from 'vitest'
import { parseEvalArgs } from './args.ts'

const SUITE_IDS = ['schema-add-branch', 'content-create-many', 'trash-restore']

describe('parseEvalArgs', () => {
  it('no flags select both variants, every suite task in suite order, model sonnet and a ten-minute timeout', () => {
    const args = parseEvalArgs([], SUITE_IDS)

    expect(args).toEqual({ variants: ['v1', 'v2'], taskIds: SUITE_IDS, model: 'sonnet', timeoutMs: 600_000, budgetUsd: 2, keepWorkspaces: false })
  })

  it('tasks passed out of order come back in suite order without duplicates', () => {
    const args = parseEvalArgs(['--task', 'trash-restore', '--task', 'schema-add-branch', '--task', 'trash-restore', '--variant', 'v2', '--variant', 'v1'], SUITE_IDS)

    expect(args.taskIds).toEqual(['schema-add-branch', 'trash-restore'])
    expect(args.variants).toEqual(['v1', 'v2'])
  })

  it('an unknown task id throws an error naming --task', () => {
    const parse = () => parseEvalArgs(['--task', 'nope'], SUITE_IDS)

    expect(parse).toThrow(/--task/)
  })

  it('an unknown variant throws an error naming --variant', () => {
    const parse = () => parseEvalArgs(['--variant', 'v3'], SUITE_IDS)

    expect(parse).toThrow(/--variant/)
  })

  it('a non-positive --timeout-min throws an error naming --timeout-min', () => {
    const parse = () => parseEvalArgs(['--timeout-min', '0'], SUITE_IDS)

    expect(parse).toThrow(/--timeout-min/)
  })
})
