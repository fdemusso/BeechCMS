// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import {
  PKCE_CHALLENGE_METHOD,
  isScopeSubset,
  parseScopeString,
  type OAuthClientRecord,
  type OAuthScope,
} from '@beechcms/core'
import { OAUTH_ERRORS, type OAuthErrorCode } from './constants'

/**
 * The raw authorization request parameters as received over the wire
 * (e.g., from query search parameters or JSON body).
 */
export interface RawAuthorizationRequest {
  /** OAuth 2.0 response_type (e.g. 'code'). */
  responseType?: string
  /** The registered client identifier. */
  clientId?: string
  /** The redirection URI where the response will be sent. */
  redirectUri?: string
  /** Space-delimited list of requested scopes. */
  scope?: string
  /** Opaque value used by the client to maintain state between the request and callback. */
  state?: string
  /** PKCE code challenge derived from the client verifier. */
  codeChallenge?: string
  /** PKCE code challenge transformation method ('S256'). */
  codeChallengeMethod?: string
}

/**
 * An authorization request that has successfully passed all syntactic,
 * cryptographic (PKCE), and client-registered allowlist checks.
 */
export interface ValidAuthorizationRequest {
  /** The validated client identifier. */
  clientId: string
  /** The verified redirection URI matching registered client URIs. */
  redirectUri: string
  /** List of parsed and validated OAuth scopes. */
  scopes: OAuthScope[]
  /** The validated client state parameter. */
  state: string
  /** The PKCE S256 code challenge string. */
  codeChallenge: string
  /** The confirmed PKCE method, strictly 'S256'. */
  codeChallengeMethod: typeof PKCE_CHALLENGE_METHOD
}

/**
 * Result of validating an authorization request.
 *
 * Distinguishes between:
 * - Successful validation (`ok: true`).
 * - `fatal` errors: MUST NOT redirect back to the client because the client identity
 *   or `redirect_uri` itself cannot be verified as trusted (RFC 6749 §4.1.2.1).
 * - `redirectable` errors: The client and redirect target are trusted, so the failure
 *   can safely be returned to the client as query parameters on its `redirect_uri`.
 */
export type AuthorizationRequestValidation =
  | { ok: true; request: ValidAuthorizationRequest }
  | { ok: false; kind: 'fatal'; error: OAuthErrorCode; description: string }
  | { ok: false; kind: 'redirectable'; error: OAuthErrorCode; description: string; redirectUri: string; state: string }

/**
 * Extracts raw authorization request parameters from URL search parameters.
 *
 * @param params - The URL search parameters from the incoming HTTP request.
 * @returns The extracted raw authorization request properties.
 */
export function readAuthorizationRequestFromQuery(params: URLSearchParams): RawAuthorizationRequest {
  return {
    responseType: params.get('response_type') ?? undefined,
    clientId: params.get('client_id') ?? undefined,
    redirectUri: params.get('redirect_uri') ?? undefined,
    scope: params.get('scope') ?? undefined,
    state: params.get('state') ?? undefined,
    codeChallenge: params.get('code_challenge') ?? undefined,
    codeChallengeMethod: params.get('code_challenge_method') ?? undefined,
  }
}

/**
 * Checks whether the given hostname belongs to the IPv4/IPv6 loopback interface.
 *
 * @param hostname - Hostname to inspect (e.g., '127.0.0.1' or '[::1]').
 * @returns True if the host is a local loopback address.
 */
function isLoopbackHost(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]'
}

/**
 * Matches a requested `redirect_uri` against the client's registered allowlist.
 *
 * Follows OAuth 2.1 §8.4.2 specifications:
 * - Loopback URIs (`127.0.0.1`, `::1`, `[::1]`) are compared on `protocol`, `hostname`,
 *   and `pathname` only. A native client or CLI binds an ephemeral port at runtime,
 *   so the registered port is not knowable in advance.
 * - URIs containing a fragment identifier (`#`) are strictly rejected (RFC 6749 §3.1.2).
 * - Every other URI must match character-for-character.
 *
 * @param requested - The redirect_uri provided in the authorization request.
 * @param registered - The list of redirect URIs pre-registered for the client.
 * @returns True if the requested URI matches an allowed registered URI.
 */
export function matchesRegisteredRedirectUri(requested: string, registered: readonly string[]): boolean {
  let requestedUrl: URL
  try {
    requestedUrl = new URL(requested)
  } catch {
    return false
  }
  if (requestedUrl.hash !== '') return false

  return registered.some(entry => {
    let registeredUrl: URL
    try {
      registeredUrl = new URL(entry)
    } catch {
      return false
    }
    if (isLoopbackHost(registeredUrl.hostname) && isLoopbackHost(requestedUrl.hostname)) {
      return (
        registeredUrl.protocol === requestedUrl.protocol &&
        registeredUrl.hostname === requestedUrl.hostname &&
        registeredUrl.pathname === requestedUrl.pathname
      )
    }
    return entry === requested
  })
}

/**
 * Validates a raw authorization request against a resolved, active client record.
 *
 * Order of evaluation is load-bearing for security:
 * 1. `redirect_uri` is checked first against `client.redirectUris`. If invalid, missing,
 *    or carrying a fragment, a `fatal` error is returned (no redirection permitted).
 * 2. If the redirect target is trusted, remaining validation errors (`state`, `response_type`,
 *    PKCE `code_challenge_method`, `code_challenge`, scopes) are reported as `redirectable`
 *    back to the client's `redirect_uri`.
 *
 * @param raw - The unparsed request fields.
 * @param client - The active client record resolved from persistence.
 * @returns A tagged union describing success or whether the error is fatal vs redirectable.
 */
export function validateAuthorizationRequest(
  raw: RawAuthorizationRequest,
  client: OAuthClientRecord,
): AuthorizationRequestValidation {
  const redirectUri = raw.redirectUri ?? ''
  if (!redirectUri || !matchesRegisteredRedirectUri(redirectUri, client.redirectUris)) {
    return { ok: false, kind: 'fatal', error: OAUTH_ERRORS.INVALID_REQUEST, description: 'redirect_uri is missing or not registered for this client' }
  }

  const state = raw.state ?? ''
  const fail = (error: OAuthErrorCode, description: string): AuthorizationRequestValidation =>
    ({ ok: false, kind: 'redirectable', error, description, redirectUri, state })

  if (!state) return fail(OAUTH_ERRORS.INVALID_REQUEST, 'state is required')
  if (raw.responseType !== 'code') return fail(OAUTH_ERRORS.UNSUPPORTED_RESPONSE_TYPE, 'only response_type=code is supported')
  if (raw.codeChallengeMethod !== PKCE_CHALLENGE_METHOD) return fail(OAUTH_ERRORS.INVALID_REQUEST, 'code_challenge_method must be S256')
  if (!raw.codeChallenge) return fail(OAUTH_ERRORS.INVALID_REQUEST, 'code_challenge is required')

  const scopes = raw.scope ? parseScopeString(raw.scope) : null
  if (!scopes) return fail(OAUTH_ERRORS.INVALID_SCOPE, 'scope is missing, empty or contains an unknown value')
  if (!isScopeSubset(scopes, client.allowedScopes)) return fail(OAUTH_ERRORS.INVALID_SCOPE, 'requested scope exceeds the scopes allowed for this client')

  return {
    ok: true,
    request: {
      clientId: client.clientId,
      redirectUri,
      scopes,
      state,
      codeChallenge: raw.codeChallenge,
      codeChallengeMethod: PKCE_CHALLENGE_METHOD,
    },
  }
}

/**
 * Builds the client-facing redirection URL carrying an OAuth error response.
 *
 * Preserves any pre-existing query parameters present on `redirectUri`
 * and appends `error`, `error_description`, and `state`.
 *
 * @param redirectUri - The target client callback URL.
 * @param error - The OAuth error code (e.g., 'invalid_scope').
 * @param description - Human-readable explanation of the error.
 * @param state - The client's state value to preserve CSRF protection.
 * @returns Serialized URL string ready for redirection.
 */
export function buildErrorRedirect(redirectUri: string, error: string, description: string, state: string): string {
  const url = new URL(redirectUri)
  url.searchParams.set('error', error)
  url.searchParams.set('error_description', description)
  if (state) url.searchParams.set('state', state)
  return url.toString()
}

/**
 * Builds the client-facing redirection URL carrying a freshly issued authorization code.
 *
 * Preserves any pre-existing query parameters on `redirectUri` and appends `code` and `state`.
 *
 * @param redirectUri - The target client callback URL.
 * @param code - The plaintext authorization code issued to the client.
 * @param state - The client's state value.
 * @returns Serialized URL string ready for redirection.
 */
export function buildSuccessRedirect(redirectUri: string, code: string, state: string): string {
  const url = new URL(redirectUri)
  url.searchParams.set('code', code)
  if (state) url.searchParams.set('state', state)
  return url.toString()
}
