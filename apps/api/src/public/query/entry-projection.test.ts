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

  it('scrubs internal, confidential, and restricted fields from public entries', () => {
    const classifiedSeed = {
      slug: 'users',
      displayNameAlias: 'username',
      branches: [
        { id: 'br_01', alias: 'username', type: 'text', policies: { classification: 'public' } },
        { id: 'br_02', alias: 'email', type: 'text', policies: { classification: 'internal' } },
        { id: 'br_03', alias: 'tax_id', type: 'text', policies: { classification: 'confidential' } },
        { id: 'br_04', alias: 'password_hash', type: 'text', policies: { classification: 'restricted' } },
      ],
    } as unknown as Seed

    const data = {
      id: 'usr_1',
      slug: 'user-1',
      username: 'alice',
      email: 'alice@internal.com',
      tax_id: 'CONF-TAX-999',
      password_hash: '$2b$12$restrictedhash',
    }

    const result = toFlatPublicEntry(data, classifiedSeed)
    expect(result).toEqual({
      id: 'usr_1',
      slug: 'user-1',
      username: 'alice',
    })
  })

  it('resolves a localized field before masking, so a masked translation shows the mask instead of null', () => {
    // Regression guard: a masked field that held a dictionary became null.
    const seed = {
      slug: 'products',
      displayNameAlias: 'title',
      branches: [
        { id: 'br_01', alias: 'tagline', type: 'text', localized: true, policies: { visibility: 'masked' } },
      ],
    } as unknown as Seed
    const config = { locales: ['it', 'en'], defaultLocale: 'it' }

    const result = toFlatPublicEntry(
      { id: '1', tagline: { it: 'Ciao', en: 'Hi' } },
      seed,
      undefined,
      { mode: 'single', locale: 'en', config },
    )

    expect(result.tagline).toBe('••••••••')
  })

  it('resolves localized fields to the requested language', () => {
    const seed = {
      slug: 'products',
      displayNameAlias: 'title',
      branches: [{ id: 'br_01', alias: 'title', type: 'text', localized: true }],
    } as unknown as Seed
    const config = { locales: ['it', 'en'], defaultLocale: 'it' }

    const result = toFlatPublicEntry(
      { id: '1', title: { it: 'Scarpa', en: 'Shoe' } },
      seed,
      undefined,
      { mode: 'single', locale: 'en', config },
    )

    expect(result.title).toBe('Shoe')
  })
})

