// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import type { Env, Variables } from '../../types'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireActiveAccount } from '../../middleware/permission.middleware'
import { authorizeHandler, authorizeRequestHandler, consentHandler } from './authorize'
import { tokenHandler } from './token'
import { revokeHandler } from './revoke'
import { listConsentsHandler, revokeConsentHandler } from './consents'

/**
 * OAuth 2.1 Authorization Server feature router.
 *
 * Implements authorization code flow with PKCE (RFC 7636), refresh token rotation,
 * and token revocation (RFC 7009).
 *
 * Route segmentation and authentication boundaries:
 * 1. **Public browser entry point**:
 *    - `GET /oauth/authorize` -> Unauthenticated. Validates client and redirect_uri,
 *      then redirects the user to the dashboard SPA consent screen.
 * 2. **Authenticated consent APIs**:
 *    - `GET /oauth/authorize/request` -> Protected by `authMiddleware()` (admin JWT) +
 *      `requireActiveAccount()`. Returns metadata for rendering the consent UI.
 *    - `POST /oauth/authorize/consent` -> Protected by `authMiddleware()` (admin JWT) +
 *      `requireActiveAccount()`. Validates role via `roleGuard`, records consent, and
 *      issues an authorization code.
 * 3. **Client-facing token endpoints**:
 *    - `POST /oauth/token` -> Public endpoint authenticated by grant parameters
 *      (code + code_verifier, or refresh_token).
 *    - `POST /oauth/revoke` -> Public RFC 7009 endpoint for token invalidation.
 * 4. **Connected-apps management**:
 *    - `GET /oauth/consents` -> Protected by `authMiddleware()` (admin JWT) +
 *      `requireActiveAccount()`. Lists the OAuth clients the resource owner has authorized.
 *    - `DELETE /oauth/consents/:clientId` -> Protected by `authMiddleware()` (admin JWT) +
 *      `requireActiveAccount()`. Cascade-revokes the consent and every live token for that client.
 *
 * None of these routes are in `PROTECTED_ROUTES` (`permission.middleware.ts`) — consent is
 * self-service for any active admin, not an RBAC-scoped permission — so each explicitly adds
 * `requireActiveAccount()` after `authMiddleware()` to still honor instant revocation: an admin
 * JWT stays cryptographically valid for up to 15 minutes after the account is deactivated.
 */
export const oauthApp = new Hono<{ Bindings: Env; Variables: Variables }>()

// Browser entry point: unauthenticated by design. Redirects to the dashboard
// consent screen, which performs the authenticated calls below.
oauthApp.get('/oauth/authorize', authorizeHandler)

// Consent-screen APIs: admin JWT required, same gate as the rest of the dashboard.
oauthApp.use('/oauth/authorize/request', authMiddleware())
oauthApp.use('/oauth/authorize/request', requireActiveAccount())
oauthApp.use('/oauth/authorize/consent', authMiddleware())
oauthApp.use('/oauth/authorize/consent', requireActiveAccount())
oauthApp.get('/oauth/authorize/request', authorizeRequestHandler)
oauthApp.post('/oauth/authorize/consent', consentHandler)

// Client-facing endpoints: no session, authenticated by the grant material itself.
oauthApp.post('/oauth/token', tokenHandler)
oauthApp.post('/oauth/revoke', revokeHandler)

// Connected-apps management: admin JWT only (never `acceptOAuth`), so a leaked
// access token cannot list the user's other clients or revoke its own audit row.
oauthApp.use('/oauth/consents', authMiddleware())
oauthApp.use('/oauth/consents', requireActiveAccount())
oauthApp.use('/oauth/consents/:clientId', authMiddleware())
oauthApp.use('/oauth/consents/:clientId', requireActiveAccount())
oauthApp.get('/oauth/consents', listConsentsHandler)
oauthApp.delete('/oauth/consents/:clientId', revokeConsentHandler)
