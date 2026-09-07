// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { Context } from 'hono'
import { sha256hex, type OAuthScope } from '@beechcms/core'
import type { Env, Variables } from '../../types'
import { generateOpaqueToken } from '../../shared/utils/opaque-token'
import { AUTHORIZATION_CODE_TTL_SECONDS, CONSENT_SCREEN_PATH, OAUTH_ERRORS } from './constants'
import {
  buildErrorRedirect,
  buildSuccessRedirect,
  readAuthorizationRequestFromQuery,
  validateAuthorizationRequest,
  type ValidAuthorizationRequest,
} from './authorization-request'

/** Context type alias for OAuth route handlers. */
type OAuthContext = Context<{ Bindings: Env; Variables: Variables }>

/**
 * Metadata payload returned to the dashboard SPA consent screen
 * to render client information, requested scopes, and determine whether
 * user interaction is required.
 */
export interface AuthorizationRequestMetadata {
  /** Basic display details of the requesting OAuth client. */
  client: { clientId: string; name: string }
  /** Every OAuth scope requested by the client in this flow. */
  requestedScopes: OAuthScope[]
  /** Scopes not yet covered by pre-existing active consent (only ones needing a prompt). */
  newScopes: OAuthScope[]
  /** False if an active consent already covers all requested scopes (incremental consent). */
  consentRequired: boolean
  /** Validated client redirection target. */
  redirectUri: string
  /** Opaque client CSRF state string. */
  state: string
}

/**
 * Request body sent by the dashboard SPA consent screen when the user
 * submits an authorization decision (approval or rejection).
 */
export interface ConsentDecisionBody {
  /** OAuth response_type ('code'). */
  response_type: string
  /** The requesting client identifier. */
  client_id: string
  /** The redirection target URL. */
  redirect_uri: string
  /** Space-separated scope string. */
  scope: string
  /** Client state string. */
  state: string
  /** PKCE code challenge. */
  code_challenge: string
  /** PKCE code challenge method ('S256'). */
  code_challenge_method: string
  /** True if the resource owner approved the grant; false if denied. */
  approved: boolean
}

/**
 * Resolves the active client and validates raw request parameters against it.
 *
 * @param context - The Hono request context providing repository access.
 * @param raw - The raw authorization parameters parsed from query or body.
 * @returns An object containing the resolved client and validation result, or nulls if client is unknown/disabled.
 */
async function resolveAndValidate(context: OAuthContext, raw: ReturnType<typeof readAuthorizationRequestFromQuery>) {
  if (!raw.clientId) return { client: null, validation: null }
  const client = await context.get('oauthClientRepository').findActiveById(raw.clientId)
  if (!client) return { client: null, validation: null }
  return { client, validation: validateAuthorizationRequest(raw, client) }
}

/**
 * `GET /oauth/authorize`
 *
 * Unauthenticated browser entry point for the authorization code flow.
 * Validates the client and redirect target. If valid, redirects the user's browser
 * to the dashboard consent screen SPA (`/admin/oauth/consent`) preserving all query parameters.
 *
 * Error handling:
 * - Fatal errors (missing client, invalid redirect_uri) return HTTP 400 without redirection.
 * - Redirectable errors (invalid scope, response_type != code) redirect to the client's `redirect_uri`.
 *
 * @param context - Hono request context.
 * @returns HTTP 302 redirect to consent screen or error response.
 */
export async function authorizeHandler(context: OAuthContext): Promise<Response> {
  const url = new URL(context.req.url)
  const raw = readAuthorizationRequestFromQuery(url.searchParams)

  if (!raw.clientId) {
    return context.json({ error: OAUTH_ERRORS.INVALID_CLIENT, error_description: 'client_id is required' }, 400)
  }

  const { client, validation } = await resolveAndValidate(context, raw)
  if (!client) {
    return context.json({ error: OAUTH_ERRORS.INVALID_CLIENT, error_description: 'unknown or disabled client' }, 400)
  }

  if (!validation!.ok && validation!.kind === 'fatal') {
    return context.json({ error: validation!.error, error_description: validation!.description }, 400)
  }
  if (!validation!.ok && validation!.kind === 'redirectable') {
    return context.redirect(buildErrorRedirect(validation!.redirectUri, validation!.error, validation!.description, validation!.state), 302)
  }

  const consentUrl = new URL(CONSENT_SCREEN_PATH + '?' + url.search.slice(1), context.req.url)
  return context.redirect(consentUrl.toString(), 302)
}

/**
 * `GET /oauth/authorize/request`
 *
 * Authenticated endpoint called by the dashboard consent screen (admin JWT required).
 * Resolves the request parameters, inspects pre-existing consents for this user and client,
 * and returns metadata determining which scopes need explicit user confirmation.
 *
 * @param context - Hono request context with authenticated JWT claims in `jwtPayload`.
 * @returns JSON response containing `AuthorizationRequestMetadata`.
 */
export async function authorizeRequestHandler(context: OAuthContext): Promise<Response> {
  const url = new URL(context.req.url)
  const raw = readAuthorizationRequestFromQuery(url.searchParams)

  if (!raw.clientId) {
    return context.json({ error: OAUTH_ERRORS.INVALID_CLIENT, error_description: 'client_id is required' }, 400)
  }

  const { client, validation } = await resolveAndValidate(context, raw)
  if (!client) {
    return context.json({ error: OAUTH_ERRORS.INVALID_CLIENT, error_description: 'unknown or disabled client' }, 400)
  }
  if (!validation!.ok && validation!.kind === 'fatal') {
    return context.json({ error: validation!.error, error_description: validation!.description }, 400)
  }
  if (!validation!.ok && validation!.kind === 'redirectable') {
    return context.redirect(buildErrorRedirect(validation!.redirectUri, validation!.error, validation!.description, validation!.state), 302)
  }

  const request = (validation as { ok: true; request: ValidAuthorizationRequest }).request
  const userId = context.get('jwtPayload').sub
  const activeConsent = await context.get('oauthConsentRepository').findActive(request.clientId, userId)
  const consentedScopes = activeConsent?.scopes ?? []
  const newScopes = request.scopes.filter(scope => !consentedScopes.includes(scope))

  const metadata: AuthorizationRequestMetadata = {
    client: { clientId: client.clientId, name: client.name },
    requestedScopes: request.scopes,
    newScopes,
    consentRequired: newScopes.length > 0,
    redirectUri: request.redirectUri,
    state: request.state,
  }
  return context.json(metadata, 200)
}

/**
 * `POST /oauth/authorize/consent`
 *
 * Authenticated endpoint called when the user submits an approval/rejection decision.
 *
 * Workflow:
 * 1. Re-validates the client and authorization parameters.
 * 2. If denied by the user, returns a redirect to `redirect_uri` with `access_denied`.
 * 3. If approved, delegates scope arbitration to `roleGuard.arbitrate(role, scopes)`
 *    to prevent granting scopes the user's role does not possess.
 * 4. Records the granted consent in `oauthConsentRepository`.
 * 5. Issues a high-entropy authorization code with 60s TTL, stores its SHA-256 hash in
 *    `oauthAuthorizationCodeRepository`, and returns the client callback URL with the code.
 *
 * @param context - Hono request context with authenticated JWT claims in `jwtPayload`.
 * @returns JSON response containing `{ redirectTo: string }`.
 */
export async function consentHandler(context: OAuthContext): Promise<Response> {
  const body = await context.req.json<ConsentDecisionBody>()
  const raw = {
    responseType: body.response_type,
    clientId: body.client_id,
    redirectUri: body.redirect_uri,
    scope: body.scope,
    state: body.state,
    codeChallenge: body.code_challenge,
    codeChallengeMethod: body.code_challenge_method,
  }

  if (!raw.clientId) {
    return context.json({ error: OAUTH_ERRORS.INVALID_CLIENT, error_description: 'client_id is required' }, 400)
  }

  const { client, validation } = await resolveAndValidate(context, raw)
  if (!client) {
    return context.json({ error: OAUTH_ERRORS.INVALID_CLIENT, error_description: 'unknown or disabled client' }, 400)
  }
  if (!validation!.ok && validation!.kind === 'fatal') {
    return context.json({ error: validation!.error, error_description: validation!.description }, 400)
  }
  if (!validation!.ok && validation!.kind === 'redirectable') {
    return context.json({ redirectTo: buildErrorRedirect(validation!.redirectUri, validation!.error, validation!.description, validation!.state) }, 200)
  }

  const request = (validation as { ok: true; request: ValidAuthorizationRequest }).request

  if (body.approved !== true) {
    return context.json(
      { redirectTo: buildErrorRedirect(request.redirectUri, OAUTH_ERRORS.ACCESS_DENIED, 'the resource owner denied the request', request.state) },
      200,
    )
  }

  const userId = context.get('jwtPayload').sub
  const nowSeconds = context.get('clock').nowSeconds()

  const decision = await context.get('roleGuard').arbitrate(context.get('jwtPayload').role, request.scopes)
  if (decision.grantedScopes.length === 0) {
    return context.json(
      { redirectTo: buildErrorRedirect(request.redirectUri, OAUTH_ERRORS.ACCESS_DENIED, 'no requested scope may be granted to this role', request.state) },
      200,
    )
  }

  await context.get('oauthConsentRepository').grant(
    context.get('idGenerator').uuid(),
    request.clientId,
    userId,
    decision.grantedScopes,
    nowSeconds,
  )

  const code = generateOpaqueToken()
  const codeHash = await sha256hex(code)
  await context.get('oauthAuthorizationCodeRepository').save({
    codeHash,
    clientId: request.clientId,
    userId,
    scope: decision.grantedScopes,
    redirectUri: request.redirectUri,
    codeChallenge: request.codeChallenge,
    codeChallengeMethod: 'S256',
    expiresAt: nowSeconds + AUTHORIZATION_CODE_TTL_SECONDS,
  })

  return context.json({ redirectTo: buildSuccessRedirect(request.redirectUri, code, request.state) }, 200)
}
