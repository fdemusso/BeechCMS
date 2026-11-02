// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import { zodJson } from '../../shared/utils/zod-json'
import { zodQuery } from '../../shared/utils/zod-query'
import type { Env, Variables } from '../../types'
import { createUserHandler, getUserHandler, listUsersHandler, setUserActiveHandler } from './users'
import { createRoleHandler, deleteRoleHandler, listRolesHandler, updateRoleHandler } from './roles'
import { createAssignmentHandler, deleteAssignmentHandler, listAssignmentsHandler } from './assignments'
import { createInvitationHandler, listInvitationsHandler, regenerateInvitationHandler, revokeInvitationHandler } from './invitations'
import { rejectInvalidBody, rejectInvalidPage, requireValidRoleId, requireValidUserId } from './guards'
import {
  createAssignmentSchema, createInvitationSchema, createUserSchema, pageQuerySchema, roleBodySchema, setActiveSchema,
} from './rbac.schema'

/**
 * RBAC administration feature router, mounted at `/api/rbac` under `apiProtected`.
 *
 * Authentication and the coarse "holds manage_users/manage_roles somewhere" gate are
 * applied upstream by `authMiddleware` + `permissionMiddleware`; this router only adds
 * request-shape middleware (`zodJson`, `zodQuery`, id checks). Each handler then makes the exact per-scope
 * decision (`hasPermission` / `canGrant`), because the scope of an administrative
 * request lives in the BODY or in the target's assignments, not in the URL.
 *
 * NOT OAuth-reachable: `OAUTH_SCOPE_ROUTES` does not list `/api/rbac/*`, and
 * `oauthScopeMiddleware()` is fail-closed, so an access token is refused 403
 * `insufficient_scope` before reaching here.
 *
 * Route order matters for `/users/:userId`: the literal sub-paths are registered first.
 *
 * Registered as one method chain so the route types reach `AppType` (see `../../routes.ts`).
 * Where an endpoint answered a malformed id (404) before it read the body, the id check is a
 * middleware ahead of `zodJson`, so the order of the refusals is part of the contract.
 */
export const rbacApp = new Hono<{ Bindings: Env; Variables: Variables }>()
  .get('/users', zodQuery(pageQuerySchema, rejectInvalidPage), listUsersHandler)
  .post('/users', zodJson(createUserSchema, rejectInvalidBody), createUserHandler)
  .get('/users/:userId/assignments', listAssignmentsHandler)
  .patch('/users/:userId/active', requireValidUserId, zodJson(setActiveSchema, rejectInvalidBody), setUserActiveHandler)
  .get('/users/:userId', getUserHandler)

  .get('/roles', listRolesHandler)
  .post('/roles', zodJson(roleBodySchema, rejectInvalidBody), createRoleHandler)
  .put('/roles/:roleId', requireValidRoleId, zodJson(roleBodySchema, rejectInvalidBody), updateRoleHandler)
  .delete('/roles/:roleId', deleteRoleHandler)

  .post('/assignments', zodJson(createAssignmentSchema, rejectInvalidBody), createAssignmentHandler)
  .delete('/assignments/:assignmentId', deleteAssignmentHandler)

  .get('/invitations', zodQuery(pageQuerySchema, rejectInvalidPage), listInvitationsHandler)
  .post('/invitations', zodJson(createInvitationSchema, rejectInvalidBody), createInvitationHandler)
  .post('/invitations/:invitationId/regenerate', regenerateInvitationHandler)
  .delete('/invitations/:invitationId', revokeInvitationHandler)
