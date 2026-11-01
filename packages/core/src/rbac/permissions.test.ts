// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { PERMISSIONS, isPermission } from './permissions.js'

describe('PERMISSIONS', () => {
  it('lists exactly the eight permissions of the closed vocabulary, manage_layout last', () => {
    expect(PERMISSIONS).toHaveLength(8)
    expect(PERMISSIONS).toEqual([
      'content:read',
      'content:create',
      'content:update',
      'content:delete',
      'manage_users',
      'manage_roles',
      'view_analytics',
      'manage_layout',
    ])
  })
})

describe('isPermission', () => {
  it('rejects manage_seeds — the categorical exclusion this test must never relax', () => {
    expect(isPermission('manage_seeds')).toBe(false)
  })

  it('accepts a known permission', () => {
    expect(isPermission('content:read')).toBe(true)
  })

  it('rejects an empty string', () => {
    expect(isPermission('')).toBe(false)
  })
})
