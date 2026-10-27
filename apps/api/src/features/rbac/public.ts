// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import type { Env, Variables } from '../../types'
import { zodJson } from '../../shared/utils/zod-json'
import { acceptInvitationHandler, limitInvitationRequests, previewInvitationHandler } from './invitations.public'
import { rejectInvalidBody } from './guards'
import { acceptInvitationSchema } from './rbac.schema'

/**
 * UNAUTHENTICATED half of the RBAC slice, mounted at the root by `factory.ts` next to
 * `passwordResetApp` — an invitee has no account and therefore no JWT, so redemption
 * cannot live under `apiProtected`.
 *
 * Paths deliberately sit under `/auth/`, NOT under `/api/`: anything under `/api/` that
 * is not in `PROTECTED_ROUTES` is refused by the fail-closed gate, and adding a public
 * path to that table would weaken the table's meaning.
 *
 * Both routes rate-limit by IP through `limitInvitationRequests`; on `accept` it runs before the
 * body is read.
 *
 * Registered as one method chain so the route types reach `AppType` (see `../../routes.ts`).
 */
export const rbacPublicApp = new Hono<{ Bindings: Env; Variables: Variables }>()
  .get('/auth/invitations/:token', limitInvitationRequests, previewInvitationHandler)
  .post('/auth/invitations/accept', limitInvitationRequests, zodJson(acceptInvitationSchema, rejectInvalidBody), acceptInvitationHandler)
