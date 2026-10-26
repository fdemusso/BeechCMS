// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { activeCondition, activeClause } from './active-clause.js'
import type { Seed } from '../types.js'

const softDeleteSeed: Seed = {
  slug: 'posts',
  label: 'Posts',
  labelPlural: 'Posts',
  displayNameAlias: 'title',
  softDelete: true,
  branches: [],
}

const plainSeed: Seed = {
  slug: 'logs',
  label: 'Logs',
  labelPlural: 'Logs',
  displayNameAlias: 'title',
  branches: [],
}

describe('activeCondition', () => {
  it('returns deleted_at IS NULL for softDelete seed with default active mode', () => {
    expect(activeCondition(softDeleteSeed)).toBe('deleted_at IS NULL')
  })

  it('returns deleted_at IS NOT NULL for trashed mode', () => {
    expect(activeCondition(softDeleteSeed, 'trashed')).toBe('deleted_at IS NOT NULL')
  })

  it('returns null for any mode', () => {
    expect(activeCondition(softDeleteSeed, 'any')).toBeNull()
  })

  it('qualifies column with tableAlias when provided', () => {
    expect(activeCondition(softDeleteSeed, 'active', 'ce')).toBe('ce.deleted_at IS NULL')
    expect(activeCondition(softDeleteSeed, 'trashed', 'p')).toBe('p.deleted_at IS NOT NULL')
  })

  it('returns deleted_at IS NULL for a seed with no flag in default mode', () => {
    expect(activeCondition(plainSeed)).toBe('deleted_at IS NULL')
  })

  it('returns null only for any mode', () => {
    expect(activeCondition(plainSeed, 'any')).toBeNull()
    expect(activeCondition(plainSeed, 'trashed')).not.toBeNull()
    expect(activeCondition(plainSeed, 'active')).not.toBeNull()
  })
})

describe('activeClause', () => {
  it('returns " AND deleted_at IS NULL" for softDelete seed with default active mode', () => {
    expect(activeClause(softDeleteSeed)).toBe(' AND deleted_at IS NULL')
  })

  it('returns " AND deleted_at IS NOT NULL" for trashed mode', () => {
    expect(activeClause(softDeleteSeed, 'trashed')).toBe(' AND deleted_at IS NOT NULL')
  })

  it('returns empty string for any mode', () => {
    expect(activeClause(softDeleteSeed, 'any')).toBe('')
  })

  it('qualifies column with tableAlias when provided', () => {
    expect(activeClause(softDeleteSeed, 'active', 'ce')).toBe(' AND ce.deleted_at IS NULL')
    expect(activeClause(softDeleteSeed, 'trashed', 'p')).toBe(' AND p.deleted_at IS NOT NULL')
  })

  it('returns " AND deleted_at IS NULL" for a seed with no flag', () => {
    expect(activeClause(plainSeed)).toBe(' AND deleted_at IS NULL')
  })
})
