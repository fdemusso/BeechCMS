// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { Context } from 'hono'
import type { OAuthScope } from '@beechcms/core'
import type { Env, Variables } from '../../types'

/** Context type alias for OAuth route handlers. */
type OAuthContext = Context<{ Bindings: Env; Variables: Variables }>

/**
 * One row of the dashboard "Connected apps" list: a live consent, enriched with
 * the client's display name and with token liveness.
 */
export interface ConnectedAppSummary {
  /** Stable identifier of the OAuth client (e.g. `beech-mcp-cli`). */
  clientId: string
  /** Human-readable client name; falls back to `clientId` when the client row was disabled. */
  name: string
  /** Scopes the resource owner has cumulatively granted to this client. */
  scopes: OAuthScope[]
  /** Unix seconds when consent was first granted. */
  grantedAt: number
  /** Unix seconds of the most recent consent update (scope widening). */
  updatedAt: number
  /** Creation time of the newest live token, or null when no token is currently valid. */
  lastIssuedAt: number | null
  /** True when at least one unexpired, unrevoked token exists for this client. */
  hasActiveTokens: boolean
}

/**
 * Successful response payload returned when revoking a connected application.
 */
export interface RevokeConsentResponse {
  /** Indicates that the authorization revocation succeeded. */
  revoked: boolean
  /** Count of active access and refresh tokens revoked during cascade. */
  tokensRevoked: number
}

/**
 * `GET /oauth/consents`
 *
 * Lists all OAuth 2.1 clients the authenticated resource owner has authorized.
 *
 * Protected by admin JWT authentication (`authMiddleware()` with default `acceptOAuth: false`).
 * Mounted outside `/api` so an OAuth access token can never enumerate or tamper with the
 * consent ledger that governs it.
 *
 * Each consent record is enriched with:
 * 1. The client's display name from `IOAuthClientRepository.findActiveById` (falls back to `clientId`).
 * 2. Token activity information from `IOAuthTokenRepository.listAuthorizedClientsForUser`.
 *
 * @param context - Hono request context with authenticated JWT claims in `jwtPayload`,
 *                  clock accessor, and injected OAuth repositories.
 * @returns HTTP 200 JSON response containing an array of {@link ConnectedAppSummary} items.
 */
export async function listConsentsHandler(context: OAuthContext): Promise<Response> {
  const userId = context.get('jwtPayload').sub
  const nowSeconds = context.get('clock').nowSeconds()

  const consents = await context.get('oauthConsentRepository').listForUser(userId)
  const liveTokens = await context.get('oauthTokenRepository')
    .listAuthorizedClientsForUser(userId, nowSeconds)
  const liveByClient = new Map(liveTokens.map(summary => [summary.clientId, summary]))

  const apps: ConnectedAppSummary[] = []
  for (const consent of consents) {
    const client = await context.get('oauthClientRepository').findActiveById(consent.clientId)
    const live = liveByClient.get(consent.clientId)
    apps.push({
      clientId: consent.clientId,
      name: client?.name ?? consent.clientId,
      scopes: consent.scopes,
      grantedAt: consent.createdAt,
      updatedAt: consent.updatedAt,
      lastIssuedAt: live?.lastIssuedAt ?? null,
      hasActiveTokens: live !== undefined,
    })
  }

  return context.json(apps, 200)
}

/**
 * `DELETE /oauth/consents/:clientId`
 *
 * Cascading revocation for an authorized client: revokes the consent row AND
 * invalidates every active access and refresh token issued to that client for the user.
 *
 * Security & Data Invariants:
 * - Protected by admin JWT authentication only (`authMiddleware()`).
 * - Cascade behavior: tokens are revoked even when the consent row was already revoked,
 *   preventing orphaned active tokens.
 * - Fails with HTTP 404 (`not_found`) if neither an active consent nor active tokens exist
 *   for the specified client.
 *
 * @param context - Hono request context containing the `clientId` route parameter
 *                  and authenticated JWT claims in `jwtPayload`.
 * @returns HTTP 200 JSON response with {@link RevokeConsentResponse} on success,
 *          or HTTP 404 JSON response if no active authorization exists for the client.
 */
export async function revokeConsentHandler(context: OAuthContext): Promise<Response> {
  const clientId = context.req.param('clientId')!
  const userId = context.get('jwtPayload').sub
  const nowSeconds = context.get('clock').nowSeconds()

  const consentRevoked = await context.get('oauthConsentRepository').revoke(clientId, userId, nowSeconds)
  const tokensRevoked = await context.get('oauthTokenRepository')
    .revokeAllForClientAndUser(clientId, userId, nowSeconds)

  if (!consentRevoked && tokensRevoked === 0) {
    return context.json({ error: 'not_found', error_description: 'no active authorization for this client' }, 404)
  }
  return context.json({ revoked: true, tokensRevoked }, 200)
}
