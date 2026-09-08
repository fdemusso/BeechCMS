// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Authorization code lifetime in seconds.
 * @see {@link https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-12#section-4.1.2 | OAuth 2.1 §4.1.2} recommends <= 60s.
 */
export const AUTHORIZATION_CODE_TTL_SECONDS = 60

/**
 * Access token lifetime in seconds (15 minutes).
 * Matches the admin JWT convention used throughout BeechCMS.
 */
export const ACCESS_TOKEN_TTL_SECONDS = 900

/**
 * Refresh token lifetime in seconds (30 days).
 */
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60

/**
 * Dashboard SPA route path that renders the OAuth user consent screen.
 */
export const CONSENT_SCREEN_PATH = '/admin/oauth/consent'

/**
 * Standard error codes defined by OAuth 2.0 / 2.1 and PKCE specifications.
 * @see {@link https://datatracker.ietf.org/doc/html/rfc6749#section-4.1.2.1 | RFC 6749 §4.1.2.1} (Authorization Error Response)
 * @see {@link https://datatracker.ietf.org/doc/html/rfc6749#section-5.2 | RFC 6749 §5.2} (Token Error Response)
 * @see {@link https://datatracker.ietf.org/doc/html/rfc7636 | RFC 7636} (PKCE)
 */
export const OAUTH_ERRORS = {
  /** The request is missing a required parameter, includes an invalid parameter value, or is otherwise malformed. */
  INVALID_REQUEST: 'invalid_request',
  /** Client authentication failed (e.g., unknown client or client is disabled). */
  INVALID_CLIENT: 'invalid_client',
  /** The provided authorization grant (code, verifier) or refresh token is invalid, expired, revoked, or already consumed. */
  INVALID_GRANT: 'invalid_grant',
  /** The requested scope is invalid, unknown, or exceeds the scope granted/allowed for the client. */
  INVALID_SCOPE: 'invalid_scope',
  /** The authenticated client is not authorized to use this authorization grant type. */
  UNAUTHORIZED_CLIENT: 'unauthorized_client',
  /** The authorization server does not support obtaining an authorization code using this response type. */
  UNSUPPORTED_RESPONSE_TYPE: 'unsupported_response_type',
  /** The authorization grant type is not supported by the authorization server. */
  UNSUPPORTED_GRANT_TYPE: 'unsupported_grant_type',
  /** The resource owner or authorization server denied the request. */
  ACCESS_DENIED: 'access_denied',
  /** The authorization server encountered an unexpected condition that prevented it from fulfilling the request. */
  SERVER_ERROR: 'server_error',
} as const

/**
 * Union of supported OAuth error code literals.
 */
export type OAuthErrorCode = (typeof OAUTH_ERRORS)[keyof typeof OAUTH_ERRORS]
