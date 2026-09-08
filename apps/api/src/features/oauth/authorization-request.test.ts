// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
import type { OAuthClientRecord } from '@beechcms/core'
import {
  buildErrorRedirect,
  buildSuccessRedirect,
  matchesRegisteredRedirectUri,
  validateAuthorizationRequest,
} from './authorization-request'

const CLIENT: OAuthClientRecord = {
  clientId: 'beech-mcp-cli',
  name: 'BeechCMS MCP Server',
  redirectUris: ['http://127.0.0.1/callback'],
  allowedScopes: ['schema:read'],
  isPublic: true,
  createdAt: 0,
  disabledAt: null,
}

const VALID_RAW = {
  responseType: 'code',
  clientId: CLIENT.clientId,
  redirectUri: 'http://127.0.0.1/callback',
  scope: 'schema:read',
  state: 'xyz',
  codeChallenge: 'challenge',
  codeChallengeMethod: 'S256',
}

describe('matchesRegisteredRedirectUri', () => {
  it('matches a loopback URI ignoring the port', () => {
    expect(matchesRegisteredRedirectUri('http://127.0.0.1:54312/callback', ['http://127.0.0.1/callback'])).toBe(true)
  })

  it('rejects a loopback URI with a different path', () => {
    expect(matchesRegisteredRedirectUri('http://127.0.0.1:54312/other', ['http://127.0.0.1/callback'])).toBe(false)
  })

  it('rejects a loopback URI with a different scheme', () => {
    expect(matchesRegisteredRedirectUri('https://127.0.0.1:54312/callback', ['http://127.0.0.1/callback'])).toBe(false)
  })

  it('requires exact string equality for non-loopback URIs', () => {
    expect(matchesRegisteredRedirectUri('https://example.com/callback', ['https://example.com/callback'])).toBe(true)
    expect(matchesRegisteredRedirectUri('https://example.com/callback?x=1', ['https://example.com/callback'])).toBe(false)
  })

  it('rejects a URI carrying a fragment', () => {
    expect(matchesRegisteredRedirectUri('http://127.0.0.1/callback#frag', ['http://127.0.0.1/callback'])).toBe(false)
  })
})

describe('validateAuthorizationRequest', () => {
  it('accepts a fully valid request', () => {
    const result = validateAuthorizationRequest(VALID_RAW, CLIENT)
    expect(result.ok).toBe(true)
  })

  it('missing or unregistered redirect_uri is fatal, never redirectable', () => {
    const result = validateAuthorizationRequest({ ...VALID_RAW, redirectUri: undefined }, CLIENT)
    expect(result).toMatchObject({ ok: false, kind: 'fatal' })

    const result2 = validateAuthorizationRequest({ ...VALID_RAW, redirectUri: 'http://evil.example/callback' }, CLIENT)
    expect(result2).toMatchObject({ ok: false, kind: 'fatal' })
  })

  it('missing state is redirectable', () => {
    const result = validateAuthorizationRequest({ ...VALID_RAW, state: undefined }, CLIENT)
    expect(result).toMatchObject({ ok: false, kind: 'redirectable', error: 'invalid_request' })
  })

  it('response_type=token is redirectable with unsupported_response_type', () => {
    const result = validateAuthorizationRequest({ ...VALID_RAW, responseType: 'token' }, CLIENT)
    expect(result).toMatchObject({ ok: false, kind: 'redirectable', error: 'unsupported_response_type' })
  })

  it('code_challenge_method=plain is redirectable with invalid_request', () => {
    const result = validateAuthorizationRequest({ ...VALID_RAW, codeChallengeMethod: 'plain' }, CLIENT)
    expect(result).toMatchObject({ ok: false, kind: 'redirectable', error: 'invalid_request' })
  })

  it('missing code_challenge is redirectable with invalid_request', () => {
    const result = validateAuthorizationRequest({ ...VALID_RAW, codeChallenge: undefined }, CLIENT)
    expect(result).toMatchObject({ ok: false, kind: 'redirectable', error: 'invalid_request' })
  })

  it('unknown scope is redirectable with invalid_scope', () => {
    const result = validateAuthorizationRequest({ ...VALID_RAW, scope: 'nonsense' }, CLIENT)
    expect(result).toMatchObject({ ok: false, kind: 'redirectable', error: 'invalid_scope' })
  })

  it('scope beyond the client allowlist is invalid_scope', () => {
    const result = validateAuthorizationRequest({ ...VALID_RAW, scope: 'schema:write' }, CLIENT)
    expect(result).toMatchObject({ ok: false, kind: 'redirectable', error: 'invalid_scope' })
  })
})

describe('buildErrorRedirect / buildSuccessRedirect', () => {
  it('preserve pre-existing query params on the redirect URI', () => {
    const errorUrl = buildErrorRedirect('https://example.com/callback?foo=bar', 'invalid_request', 'oops', 'state1')
    const parsed = new URL(errorUrl)
    expect(parsed.searchParams.get('foo')).toBe('bar')
    expect(parsed.searchParams.get('error')).toBe('invalid_request')
    expect(parsed.searchParams.get('state')).toBe('state1')

    const successUrl = buildSuccessRedirect('https://example.com/callback?foo=bar', 'code123', 'state1')
    const parsedSuccess = new URL(successUrl)
    expect(parsedSuccess.searchParams.get('foo')).toBe('bar')
    expect(parsedSuccess.searchParams.get('code')).toBe('code123')
  })
})
