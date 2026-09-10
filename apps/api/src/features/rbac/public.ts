// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import type { Env, Variables } from '../../types'
import { acceptInvitationHandler, previewInvitationHandler } from './invitations.public'

/**
 * UNAUTHENTICATED half of the RBAC slice, mounted at the root by `factory.ts` next to
 * `passwordResetApp` — an invitee has no account and therefore no JWT, so redemption
 * cannot live under `apiProtected`.
 *
 * Paths deliberately sit under `/auth/`, NOT under `/api/`: anything under `/api/` that
 * is not in `PROTECTED_ROUTES` is refused by the fail-closed gate, and adding a public
 * path to that table would weaken the table's meaning.
 *
 * Both handlers rate-limit by IP themselves; there is no middleware on this router.
 */
export const rbacPublicApp = new Hono<{ Bindings: Env; Variables: Variables }>()

rbacPublicApp.get('/auth/invitations/:token', previewInvitationHandler)
rbacPublicApp.post('/auth/invitations/accept', acceptInvitationHandler)
