// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import type { Env, Variables } from '../../types'
import { authorizeHandler } from './authorize'
import { tokenHandler } from './token'
import { revokeHandler } from './revoke'

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
 * 2. **Client-facing token endpoints**:
 *    - `POST /oauth/token` -> Public endpoint authenticated by grant parameters
 *      (code + code_verifier, or refresh_token).
 *    - `POST /oauth/revoke` -> Public RFC 7009 endpoint for token invalidation.
 *
 * The dashboard-facing half (consent screen APIs and the connected-apps list) lives in
 * `consent.router.ts`, a typed method chain behind admin JWT + `requireActiveAccount()`.
 */
export const oauthApp = new Hono<{ Bindings: Env; Variables: Variables }>()

// Browser entry point: unauthenticated by design. Redirects to the dashboard
// consent screen, which performs the authenticated calls below.
oauthApp.get('/oauth/authorize', authorizeHandler)

// Client-facing endpoints: no session, authenticated by the grant material itself.
oauthApp.post('/oauth/token', tokenHandler)
oauthApp.post('/oauth/revoke', revokeHandler)
