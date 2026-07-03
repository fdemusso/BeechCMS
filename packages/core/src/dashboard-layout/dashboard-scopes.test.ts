// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import {
  KNOWN_DASHBOARD_ROLES,
  DEFAULT_DASHBOARD_SCOPE,
  roleScope,
  isValidDashboardScope,
  resolveDashboardScopeChain,
} from './dashboard-scopes.js'

describe('roleScope', () => {
  it('namespaces a role into a scope string', () => {
    expect(roleScope('admin')).toBe('role:admin')
    expect(roleScope('editor')).toBe('role:editor')
  })
})

describe('isValidDashboardScope', () => {
  it('accepts default and known role scopes', () => {
    expect(isValidDashboardScope('default')).toBe(true)
    for (const role of KNOWN_DASHBOARD_ROLES) {
      expect(isValidDashboardScope(roleScope(role))).toBe(true)
    }
  })

  it('rejects unknown roles and malformed scopes', () => {
    expect(isValidDashboardScope('role:ghost')).toBe(false)
    expect(isValidDashboardScope('role:')).toBe(false)
    expect(isValidDashboardScope('garbage')).toBe(false)
  })
})

describe('resolveDashboardScopeChain', () => {
  it('returns role scope then default for known roles', () => {
    expect(resolveDashboardScopeChain('editor')).toEqual(['role:editor', 'default'])
    expect(resolveDashboardScopeChain('admin')).toEqual(['role:admin', 'default'])
  })

  it('falls back to default only for unknown or missing roles', () => {
    expect(resolveDashboardScopeChain('ghost')).toEqual([DEFAULT_DASHBOARD_SCOPE])
    expect(resolveDashboardScopeChain(undefined)).toEqual([DEFAULT_DASHBOARD_SCOPE])
    expect(resolveDashboardScopeChain(null)).toEqual([DEFAULT_DASHBOARD_SCOPE])
  })
})
