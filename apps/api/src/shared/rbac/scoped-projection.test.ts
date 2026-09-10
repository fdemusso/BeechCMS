// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
import type { EffectivePermissions, Seed } from '@beechcms/core'
import { filterSeedsByPermission, serializeEffectivePermissions } from './scoped-projection'

const ARTICLES: Seed = {
  slug: 'articles',
  label: 'Articles',
  labelPlural: 'Articles',
  displayNameAlias: 'title',
  allowDrafts: false,
  branches: [],
}

const PAGES: Seed = {
  slug: 'pages',
  label: 'Pages',
  labelPlural: 'Pages',
  displayNameAlias: 'title',
  allowDrafts: false,
  branches: [],
}

const EMPTY: EffectivePermissions = { global: new Set(), byScope: new Map() }

describe('filterSeedsByPermission', () => {
  it('a global grant returns every seed, order preserved', () => {
    const effective: EffectivePermissions = { global: new Set(['content:read']), byScope: new Map() }
    expect(filterSeedsByPermission([ARTICLES, PAGES], effective, 'content:read')).toEqual([ARTICLES, PAGES])
  })

  it('a scoped grant on articles returns only articles', () => {
    const effective: EffectivePermissions = {
      global: new Set(),
      byScope: new Map([['articles', new Set(['content:read'])]]),
    }
    expect(filterSeedsByPermission([ARTICLES, PAGES], effective, 'content:read')).toEqual([ARTICLES])
  })

  it('empty authority returns []', () => {
    expect(filterSeedsByPermission([ARTICLES, PAGES], EMPTY, 'content:read')).toEqual([])
  })

  it('a scoped grant of content:update alone does not make the seed visible under content:read', () => {
    const effective: EffectivePermissions = {
      global: new Set(),
      byScope: new Map([['articles', new Set(['content:update'])]]),
    }
    expect(filterSeedsByPermission([ARTICLES, PAGES], effective, 'content:read')).toEqual([])
  })
})

describe('serializeEffectivePermissions', () => {
  it('sorts global, sorts each scope array, and sorts scope keys', () => {
    const effective: EffectivePermissions = {
      global: new Set(['content:update', 'content:create']),
      byScope: new Map([
        ['pages', new Set(['content:update', 'content:read'])],
        ['articles', new Set(['content:read'])],
      ]),
    }
    expect(serializeEffectivePermissions(effective)).toEqual({
      global: ['content:create', 'content:update'],
      byScope: {
        articles: ['content:read'],
        pages: ['content:read', 'content:update'],
      },
    })
  })

  it('empty authority serializes to { global: [], byScope: {} }', () => {
    expect(serializeEffectivePermissions(EMPTY)).toEqual({ global: [], byScope: {} })
  })
})
