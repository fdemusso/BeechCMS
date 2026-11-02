// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
import { authorizationRequestQuerySchema, consentDecisionBodySchema } from './oauth.schema'

describe('consentDecisionBodySchema', () => {
  it.each([[null], [[]], [5], ['text'], [{ scope: 12345 }]])(
    'accepts %j, because the handler judges the body and answers with the OAuth error',
    (body) => {
      const result = consentDecisionBodySchema.safeParse(body)

      expect(result.success).toBe(true)
    },
  )
})

describe('authorizationRequestQuerySchema', () => {
  it('accepts a query with none of the OAuth parameters, so the handler answers invalid_client itself', () => {
    const result = authorizationRequestQuerySchema.safeParse({})

    expect(result.success).toBe(true)
  })

  it('drops keys it does not name', () => {
    const result = authorizationRequestQuerySchema.parse({ client_id: 'beech-mcp-cli', utm: 'x' })

    expect(result).toEqual({ client_id: 'beech-mcp-cli' })
  })
})
