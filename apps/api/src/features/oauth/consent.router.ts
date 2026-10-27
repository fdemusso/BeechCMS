// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Hono } from 'hono'
import type { Context } from 'hono'
import type { AppEnv } from '../../types'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireActiveAccount } from '../../middleware/permission.middleware'
import { zodJson } from '../../shared/utils/zod-json'
import { zodQuery } from '../../shared/utils/zod-query'
import { OAUTH_ERRORS } from './constants'
import { authorizeRequestHandler, consentHandler } from './authorize'
import { listConsentsHandler, revokeConsentHandler } from './consents'
import { authorizationRequestQuerySchema, consentDecisionBodySchema } from './oauth.schema'

/** The consent body is not JSON at all; any JSON value is the handler's to judge. */
function rejectMalformedConsentBody(context: Context<AppEnv>) {
  return context.json({ error: OAUTH_ERRORS.INVALID_REQUEST, error_description: 'request body must be valid JSON' }, 400)
}

/**
 * The dashboard-facing half of the OAuth server: the consent screen and the "Connected apps" list.
 * Registered as one method chain so the route types reach `AppType` (see `../../routes.ts`); the
 * browser entry point and the client-facing token endpoints stay in `./index.ts`.
 *
 * Admin JWT only (never `acceptOAuth`), and the gate covers every method of these paths, so an
 * unauthenticated request is refused with 401 whatever its verb. `requireActiveAccount()` follows
 * `authMiddleware()` to honor instant revocation: an admin JWT stays valid for up to 15 minutes
 * after the account is deactivated.
 */
export const oauthConsentApp = new Hono<AppEnv>()
  .use('/oauth/authorize/request', authMiddleware(), requireActiveAccount())
  .use('/oauth/authorize/consent', authMiddleware(), requireActiveAccount())
  .get('/oauth/authorize/request', zodQuery(authorizationRequestQuerySchema), authorizeRequestHandler)
  .post('/oauth/authorize/consent', zodJson(consentDecisionBodySchema, rejectMalformedConsentBody), consentHandler)
  // Connected-apps management: a leaked access token cannot list the user's other clients or
  // revoke its own audit row.
  .use('/oauth/consents', authMiddleware(), requireActiveAccount())
  .use('/oauth/consents/:clientId', authMiddleware(), requireActiveAccount())
  .get('/oauth/consents', listConsentsHandler)
  .delete('/oauth/consents/:clientId', revokeConsentHandler)
