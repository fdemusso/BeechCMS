// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { resolveAuthorizedViews, isViewAuthorized, DEFAULT_AUTHORIZED_VIEWS } from './view-authorization.js'
import type { Seed } from './types.js'

const baseSeed: Pick<Seed, 'dashboard'> = { dashboard: undefined }

describe('resolveAuthorizedViews', () => {
  it('always includes table', () => {
    expect(resolveAuthorizedViews(baseSeed)).toContain('table')
  })

  it('empty config → DEFAULT_AUTHORIZED_VIEWS + table guarantee', () => {
    const result = resolveAuthorizedViews({ dashboard: {} })
    expect(result).toEqual(['table'])
    expect(result).toStrictEqual([...DEFAULT_AUTHORIZED_VIEWS])
  })

  it('null-ish views array → fallback', () => {
    expect(resolveAuthorizedViews({ dashboard: { views: [] } })).toEqual(['table'])
    expect(resolveAuthorizedViews({ dashboard: { views: undefined } })).toEqual(['table'])
  })

  it('strips unknown/legacy values', () => {
    // 'grid' and 'chart' are ViewType members but not authorizable
    const result = resolveAuthorizedViews({ dashboard: { views: ['table', 'grid' as never, 'chart' as never] } })
    expect(result).not.toContain('grid')
    expect(result).not.toContain('chart')
    expect(result).toContain('table')
  })

  it('deduplicates', () => {
    const result = resolveAuthorizedViews({ dashboard: { views: ['table', 'table', 'gallery'] } })
    expect(result.filter((v) => v === 'table')).toHaveLength(1)
  })

  it('preserves canonical order (table → gallery → kanban)', () => {
    const result = resolveAuthorizedViews({ dashboard: { views: ['kanban', 'gallery', 'table'] } })
    expect(result).toEqual(['table', 'gallery', 'kanban'])
  })

  it('table guaranteed even when explicitly omitted', () => {
    const result = resolveAuthorizedViews({ dashboard: { views: ['gallery', 'kanban'] } })
    expect(result).toContain('table')
  })
})

describe('isViewAuthorized', () => {
  it('returns true for authorized view', () => {
    expect(isViewAuthorized({ dashboard: { views: ['table', 'gallery'] } }, 'gallery')).toBe(true)
  })

  it('returns false for non-authorized view', () => {
    expect(isViewAuthorized({ dashboard: { views: ['table'] } }, 'gallery')).toBe(false)
  })

  it('returns false for unknown view string', () => {
    expect(isViewAuthorized(baseSeed, 'chart')).toBe(false)
    expect(isViewAuthorized(baseSeed, 'grid')).toBe(false)
    expect(isViewAuthorized(baseSeed, '')).toBe(false)
  })

  it('table always authorized', () => {
    expect(isViewAuthorized({ dashboard: { views: ['gallery'] } }, 'table')).toBe(true)
  })
})
