// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { resolveCandidateIds } from './candidate-ids.js'
import type { Branch, Seed } from '../types.js'

const stored: Seed = {
  slug: 'clienti',
  label: 'Clienti',
  displayNameAlias: 'name',
  branches: [
    { id: 'br_c1', alias: 'name', label: 'Name', type: 'text' },
    { id: 'br_c4', alias: 'contacts', label: 'Contacts', type: 'repeater', fields: [
      { id: 'br_s7', alias: 'email', label: 'Email', type: 'text' },
    ] },
  ],
} as Seed

// resolveCandidateIds is typed T -> T, but it fills the id of every branch: read the result as a Branch list.
function resolveBranches(candidate: { branches?: unknown }, from: Seed | null): Branch[] {
  return (resolveCandidateIds(candidate, from) as { branches: Branch[] }).branches
}

describe('resolveCandidateIds', () => {
  it('reuses the stored id by alias and mints past the highest id for new aliases', () => {
    const candidate = { slug: 'clienti', branches: [
      { alias: 'tier', label: 'Tier', type: 'text' },
      { alias: 'name', label: 'Name', type: 'text' },
    ] }

    const resolved = resolveBranches(candidate, stored)

    expect(resolved.map(b => [b.alias, b.id])).toEqual([['tier', 'br_01'], ['name', 'br_c1']])
  })

  it('reuses stored repeater sub-field ids by alias and mints for new sub-fields', () => {
    const candidate = { slug: 'clienti', branches: [
      { alias: 'contacts', label: 'Contacts', type: 'repeater', fields: [
        { alias: 'phone', label: 'Phone', type: 'text' },
        { alias: 'email', label: 'Email', type: 'text' },
      ] },
    ] }

    const [contacts] = resolveBranches(candidate, stored)

    expect(contacts.id).toBe('br_c4')
    expect(contacts.fields?.map(f => [f.alias, f.id])).toEqual([['phone', 'br_01'], ['email', 'br_s7']])
  })

  it('keeps an id the candidate already carries', () => {
    const candidate = { slug: 'clienti', branches: [{ id: 'br_09', alias: 'name', label: 'Name', type: 'text' }] }

    expect(resolveCandidateIds(candidate, stored).branches[0].id).toBe('br_09')
  })

  it('never mints an id an explicit branch later in the candidate already carries', () => {
    const candidate = { slug: 'fresh', branches: [
      { alias: 'a', label: 'A', type: 'text' },
      { id: 'br_01', alias: 'b', label: 'B', type: 'text' },
    ] }

    expect(resolveBranches(candidate, null).map(b => b.id)).toEqual(['br_02', 'br_01'])
  })

  it('never recycles the id of a stored branch the candidate omits', () => {
    const storedWithTop: Seed = { ...stored, branches: [...stored.branches, { id: 'br_05', alias: 'old', label: 'Old', type: 'text' }] }
    const candidate = { slug: 'clienti', branches: [{ alias: 'fresh', label: 'Fresh', type: 'text' }] }

    expect(resolveBranches(candidate, storedWithTop)[0].id).toBe('br_06')
  })

  it('mints sequential ids when there is no stored definition', () => {
    const candidate = { slug: 'fresh', branches: [
      { alias: 'a', label: 'A', type: 'text' },
      { alias: 'b', label: 'B', type: 'text' },
    ] }

    expect(resolveBranches(candidate, null).map(b => b.id)).toEqual(['br_01', 'br_02'])
  })
})
