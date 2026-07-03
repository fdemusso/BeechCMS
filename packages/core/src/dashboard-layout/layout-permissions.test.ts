// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { canEditLayout, ROLES_ALLOWED_TO_EDIT_LAYOUT } from './layout-permissions.js'

describe('canEditLayout', () => {
  it('returns true for admin', () => {
    expect(canEditLayout('admin')).toBe(true)
  })

  it('returns false for non-admin roles', () => {
    expect(canEditLayout('editor')).toBe(false)
    expect(canEditLayout('viewer')).toBe(false)
  })

  it('returns false for undefined and null', () => {
    expect(canEditLayout(undefined)).toBe(false)
    expect(canEditLayout(null)).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(canEditLayout('')).toBe(false)
  })
})

describe('ROLES_ALLOWED_TO_EDIT_LAYOUT', () => {
  it('contains admin', () => {
    expect(ROLES_ALLOWED_TO_EDIT_LAYOUT).toContain('admin')
  })
})
