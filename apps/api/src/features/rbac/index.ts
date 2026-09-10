// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import type { Env, Variables } from '../../types'
import { createUserHandler, getUserHandler, listUsersHandler, setUserActiveHandler } from './users'
import { createRoleHandler, deleteRoleHandler, listRolesHandler, updateRoleHandler } from './roles'
import { createAssignmentHandler, deleteAssignmentHandler, listAssignmentsHandler } from './assignments'

/**
 * RBAC administration feature router, mounted at `/api/rbac` under `apiProtected`.
 *
 * Authentication and the coarse "holds manage_users/manage_roles somewhere" gate are
 * applied upstream by `authMiddleware` + `permissionMiddleware`; this router never
 * registers a middleware of its own. Each handler then makes the exact per-scope
 * decision (`hasPermission` / `canGrant`), because the scope of an administrative
 * request lives in the BODY or in the target's assignments, not in the URL.
 *
 * NOT OAuth-reachable: `OAUTH_SCOPE_ROUTES` does not list `/api/rbac/*`, and
 * `oauthScopeMiddleware()` is fail-closed, so an access token is refused 403
 * `insufficient_scope` before reaching here.
 *
 * Route order matters for `/users/:userId`: the literal sub-paths are registered first.
 */
export const rbacApp = new Hono<{ Bindings: Env; Variables: Variables }>()

rbacApp.get('/users', listUsersHandler)
rbacApp.post('/users', createUserHandler)
rbacApp.get('/users/:userId/assignments', listAssignmentsHandler)
rbacApp.patch('/users/:userId/active', setUserActiveHandler)
rbacApp.get('/users/:userId', getUserHandler)

rbacApp.get('/roles', listRolesHandler)
rbacApp.post('/roles', createRoleHandler)
rbacApp.put('/roles/:roleId', updateRoleHandler)
rbacApp.delete('/roles/:roleId', deleteRoleHandler)

rbacApp.post('/assignments', createAssignmentHandler)
rbacApp.delete('/assignments/:assignmentId', deleteAssignmentHandler)
