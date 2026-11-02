// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { PERMISSIONS, isPermission } from './permissions.js'

describe('PERMISSIONS', () => {
  it('lists exactly the nine permissions of the closed vocabulary, manage_seeds last', () => {
    expect(PERMISSIONS).toHaveLength(9)
    expect(PERMISSIONS).toEqual([
      'content:read',
      'content:create',
      'content:update',
      'content:delete',
      'manage_users',
      'manage_roles',
      'view_analytics',
      'manage_layout',
      'manage_seeds',
    ])
  })
})

describe('isPermission', () => {
  it('accepts manage_seeds, which brief rule 29 admits to the vocabulary', () => {
    expect(isPermission('manage_seeds')).toBe(true)
  })

  it('rejects a name outside the vocabulary', () => {
    expect(isPermission('seeds:write')).toBe(false)
  })

  it('accepts a known permission', () => {
    expect(isPermission('content:read')).toBe(true)
  })

  it('rejects an empty string', () => {
    expect(isPermission('')).toBe(false)
  })
})
