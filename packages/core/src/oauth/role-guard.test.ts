// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { AllowAllRoleGuard } from './role-guard.js'
import type { OAuthScope } from './scopes.js'

const REQUESTED: OAuthScope[] = ['schema:read', 'schema:write']

describe('AllowAllRoleGuard', () => {
  it('grants every requested scope for an admin role', async () => {
    const decision = await new AllowAllRoleGuard().arbitrate('admin', REQUESTED)
    expect(decision).toEqual({ grantedScopes: REQUESTED, deniedScopes: [] })
  })

  it('grants every requested scope for an unknown role', async () => {
    const decision = await new AllowAllRoleGuard().arbitrate('some-unknown-role', REQUESTED)
    expect(decision).toEqual({ grantedScopes: REQUESTED, deniedScopes: [] })
  })

  it('grants every requested scope when role is undefined', async () => {
    const decision = await new AllowAllRoleGuard().arbitrate(undefined, REQUESTED)
    expect(decision).toEqual({ grantedScopes: REQUESTED, deniedScopes: [] })
  })
})
