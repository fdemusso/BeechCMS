// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import type { Branch, Seed } from '../engine/types.js'
import { validateSeedDefinitions } from '../engine/seeds/seed-validation.js'
import { resolveRelationAvatar } from './relation-avatar.js'

const photo: Branch = { id: 'br_photo', alias: 'photo', label: 'Photo', type: 'file', fileOptions: { accept: 'image' } }

const people: Seed = {
  slug: 'people',
  label: 'Person',
  displayNameAlias: 'name',
  branches: [{ id: 'br_name', alias: 'name', label: 'Name', type: 'text' }, photo],
}

function teamWith(avatarSource: string | undefined, extra: Partial<Branch> = {}): Seed {
  return {
    slug: 'teams',
    label: 'Team',
    displayNameAlias: 'title',
    branches: [
      { id: 'br_title', alias: 'title', label: 'Title', type: 'text' },
      { id: 'br_members', alias: 'members', label: 'Members', type: 'relation', targetSeed: 'people', multiple: true, onDelete: 'CASCADE', avatarSource, ...extra },
    ],
  }
}

const lookup = (seeds: Seed[]) => (slug: string) => seeds.find((s) => s.slug === slug)

describe('resolveRelationAvatar', () => {
  it('returns the target image branch named by avatarSource', () => {
    const members = teamWith('photo').branches[1]

    const source = resolveRelationAvatar(members, lookup([people]))

    expect(source?.alias).toBe('photo')
  })

  it('is null for a relation without avatarSource', () => {
    const members = teamWith(undefined).branches[1]

    expect(resolveRelationAvatar(members, lookup([people]))).toBeNull()
  })

  it('is null once the named field is gone, so a stale config degrades instead of throwing', () => {
    const members = teamWith('photo').branches[1]
    const withoutPhoto: Seed = { ...people, branches: [people.branches[0]] }

    expect(resolveRelationAvatar(members, lookup([withoutPhoto]))).toBeNull()
  })

  it('is null when the named field is not an image', () => {
    const members = teamWith('name').branches[1]

    expect(resolveRelationAvatar(members, lookup([people]))).toBeNull()
  })

  it('is null for a branch that is not a relation', () => {
    const resolved = resolveRelationAvatar({ ...photo, avatarSource: 'photo' }, lookup([people]))

    expect(resolved).toBeNull()
  })
})

describe('validateSeedDefinitions avatarSource', () => {
  it('accepts an image file branch of the target', () => {
    const issues = validateSeedDefinitions([people, teamWith('photo')])

    expect(issues).toEqual([])
  })

  it('is fatal when the named field is not an image file of the target', () => {
    const issues = validateSeedDefinitions([people, teamWith('name')])

    expect(issues).toEqual([
      { slug: 'teams', fatal: true, messages: [expect.stringContaining("avatarSource 'name'")] },
    ])
  })

  it('is fatal when set on a branch that is not a relation', () => {
    const seed: Seed = { ...people, branches: [people.branches[0], { ...photo, avatarSource: 'photo' }] }

    const issues = validateSeedDefinitions([seed])

    expect(issues).toEqual([
      { slug: 'people', fatal: true, messages: [expect.stringContaining('is not a relation')] },
    ])
  })
})
