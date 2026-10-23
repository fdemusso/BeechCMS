// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AutomationAction, ContentRepository, IIdGenerator, Seed } from '@beechcms/core'
import { executeCreateEntry } from './create-entry.executor'

type CreateEntryAction = Extract<AutomationAction, { type: 'create_entry' }>

const targetSeed = {
  slug: 'comments',
  displayNameAlias: 'title',
  branches: [
    { id: 'br_title', alias: 'title', label: 'Title', type: 'text' },
    { id: 'br_body', alias: 'body', label: 'Body', type: 'richtext' },
  ],
} as unknown as Seed

describe('executeCreateEntry', () => {
  const create = vi.fn().mockResolvedValue(undefined)
  const repository = { create } as unknown as ContentRepository
  const idGenerator = { uuid: vi.fn().mockReturnValue('new-id-123') } as unknown as IIdGenerator
  const getSeed = (slug: string) => (slug === 'comments' ? targetSeed : null)

  function run(action: CreateEntryAction, entry: Record<string, unknown>) {
    return executeCreateEntry(action, entry, repository, getSeed, idGenerator)
  }

  beforeEach(() => vi.clearAllMocks())

  it('rejects a mapped value carrying script markup and never writes', async () => {
    const entry = { id: 'e1', comment: '<script>alert(1)</script>' }

    const result = run({ type: 'create_entry', seed_slug: 'comments', field_map: { body: 'comment' } }, entry)

    await expect(result).rejects.toThrow(/dangerous content/)
    expect(create).not.toHaveBeenCalled()
  })

  it('rejects a value of the wrong type for the target branch and never writes', async () => {
    const entry = { id: 'e1', nested: { a: 1 } }

    const result = run({ type: 'create_entry', seed_slug: 'comments', field_map: { title: 'nested' } }, entry)

    await expect(result).rejects.toThrow(/validation failed/)
    expect(create).not.toHaveBeenCalled()
  })

  // A prototype-traversing `in` check resolved `constructor` to Object() and wrote a function as data.
  it('treats an inherited property name as a literal, not as a source field', async () => {
    const entry = { id: 'e1' }

    await run({ type: 'create_entry', seed_slug: 'comments', field_map: { title: 'constructor' } }, entry)

    expect(create).toHaveBeenCalledWith(targetSeed, 'new-id-123', 'new-id-123', 'draft', { title: 'constructor' })
  })

  it('writes the sanitized payload produced by the validator', async () => {
    const entry = { id: 'e1', author: 'Alice' }

    await run({ type: 'create_entry', seed_slug: 'comments', field_map: { title: 'author' } }, entry)

    expect(create).toHaveBeenCalledWith(targetSeed, 'new-id-123', 'new-id-123', 'draft', { title: 'Alice' })
  })

  // `slug` is a system column, not a branch: validation rejects it before the repository is reached.
  it('rejects a field_map target named slug with a validation error and never writes', async () => {
    const entry = { id: 'e1', author: 'Alice', existing: 'taken' }

    const result = run({ type: 'create_entry', seed_slug: 'comments', field_map: { title: 'author', slug: 'existing' } }, entry)

    await expect(result).rejects.toThrow(/Field 'slug' is not defined/)
    expect(create).not.toHaveBeenCalled()
  })
})
