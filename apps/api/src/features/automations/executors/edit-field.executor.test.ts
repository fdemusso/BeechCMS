// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import type { ContentRepository, IIdGenerator, Seed } from '@beechcms/core'
import { executeEditField } from './edit-field.executor'
import { resolveAutomationContext } from '../evaluator/context-resolver'

const SEED: Seed = {
  slug: 'clienti',
  label: 'Clienti',
  branches: [
    { alias: 'name', label: 'Name', type: 'text', id: 'br_01' },
    { alias: 'display', label: 'Display', type: 'text', id: 'br_02' },
  ],
} as unknown as Seed

const ID_GENERATOR = { uuid: vi.fn().mockReturnValue('new-id') } as unknown as IIdGenerator

describe('executeEditField', () => {
  it('writes a substituted field value to the repository verbatim, without HTML entities', async () => {
    const entry = { id: 'entry-1', name: "O'Brien & Sons" }
    const context = await resolveAutomationContext({} as never, entry, [entry])
    const update = vi.fn().mockResolvedValue(undefined)
    const repository = { update } as unknown as ContentRepository

    await executeEditField(
      { type: 'edit_field', field: 'display', value: '{{this.name}}' },
      entry,
      context,
      repository,
      SEED,
      ID_GENERATOR,
    )

    // Regression guard: interpolate() HTML-escaped every substitution, so the stored value
    // became "O&#39;Brien &amp; Sons" and was escaped again on every re-run.
    expect(update).toHaveBeenCalledTimes(1)
    const [, id, data] = update.mock.calls[0] as [Seed, string, Record<string, unknown>]
    expect(id).toBe('entry-1')
    expect(Object.values(data)).toEqual(["O'Brien & Sons"])
  })
})
