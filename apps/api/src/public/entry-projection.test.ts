// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
import { toFlatPublicEntry } from './entry-projection'
import type { Seed } from '@beechcms/core'

const SEED = {
  slug: 'employees',
  displayNameAlias: 'name',
  branches: [
    { id: 'br_01', alias: 'name', type: 'text' },
    { id: 'br_02', alias: 'salary', type: 'number', policies: { visibility: 'masked' } },
    { id: 'br_03', alias: 'is_active', type: 'boolean', policies: { visibility: 'masked' } },
    { id: 'br_04', alias: 'notes', type: 'text', policies: { visibility: 'masked' } },
  ],
} as unknown as Seed

describe('toFlatPublicEntry', () => {
  it('masks a non-empty string branch', () => {
    const data = { id: '1', slug: 'jane', name: 'Jane', salary: 123000, is_active: true, notes: 'secret' }
    const result = toFlatPublicEntry(data, SEED)
    expect(result.notes).toBe('••••••••')
  })

  it('masks a number branch to null instead of leaking raw value', () => {
    const data = { id: '1', slug: 'jane', name: 'Jane', salary: 123000, is_active: true, notes: 'secret' }
    const result = toFlatPublicEntry(data, SEED)
    expect(result.salary).toBeNull()
  })

  it('masks a boolean branch to null instead of leaking raw value', () => {
    const data = { id: '1', slug: 'jane', name: 'Jane', salary: 123000, is_active: true, notes: 'secret' }
    const result = toFlatPublicEntry(data, SEED)
    expect(result.is_active).toBeNull()
  })

  it('masks an empty string branch to null', () => {
    const data = { id: '1', slug: 'jane', name: 'Jane', salary: 0, is_active: false, notes: '' }
    const result = toFlatPublicEntry(data, SEED)
    expect(result.notes).toBeNull()
  })

  it('leaves unmasked branches untouched', () => {
    const data = { id: '1', slug: 'jane', name: 'Jane', salary: 123000, is_active: true, notes: 'secret' }
    const result = toFlatPublicEntry(data, SEED)
    expect(result.name).toBe('Jane')
  })
})
