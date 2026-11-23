// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from 'vitest'
import { CLI_OAUTH_SCOPE } from 'cli-control-plane'
import { redirectUriFor, SCRIPT_GRANT_SCOPE } from './grants.ts'

describe('SCRIPT_GRANT_SCOPE', () => {
  // Regression guard: the harness grant must never drift from the scope `beech run` requests.
  it('equals the CLI client scope beech run requests', () => {
    expect(SCRIPT_GRANT_SCOPE).toBe(CLI_OAUTH_SCOPE)
  })
})

describe('redirectUriFor', () => {
  it('maps each seeded client to its registered callback path', () => {
    expect(redirectUriFor('beech-mcp')).toBe('http://127.0.0.1:8977/oauth/callback')
    expect(redirectUriFor('beech-mcp-cli')).toBe('http://127.0.0.1:8977/callback')
  })

  it('throws for an unknown client', () => {
    const lookup = () => redirectUriFor('other-client')

    expect(lookup).toThrow(/other-client/)
  })
})
