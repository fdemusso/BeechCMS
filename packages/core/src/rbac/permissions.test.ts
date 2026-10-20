// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { PERMISSIONS, isPermission } from './permissions.js'

describe('PERMISSIONS', () => {
  it('has exactly 7 members and matches the documented list verbatim', () => {
    expect(PERMISSIONS).toHaveLength(7)
    expect(PERMISSIONS).toEqual([
      'content:read',
      'content:create',
      'content:update',
      'content:delete',
      'manage_users',
      'manage_roles',
      'view_analytics',
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
