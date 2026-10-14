// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { GLOBAL_SCOPE } from '@beechcms/core'

/**
 * SQL for the last-global-admin invariant, shared by every write that can remove
 * administrative authority (assignment delete, account deactivation, role edit/delete).
 *
 * The check lives INSIDE the mutating statement. A count read followed by a separate write
 * lets two concurrent requests, each targeting a different remaining administrator, both
 * pass the count and leave zero; D1 serialises single statements, so the second one sees the
 * first one's effect.
 */

/** Fragment aliases: `oa` assignment, `orp` role permission, `ou` user. */
const OTHER_ACTIVE_GLOBAL_ADMIN = (exclusion: string) =>
  `EXISTS (SELECT 1 FROM user_role_assignments oa
           JOIN role_permissions orp ON orp.role_id = oa.role_id
           JOIN users ou ON ou.id = oa.user_id
           WHERE oa.scope = '${GLOBAL_SCOPE}' AND orp.permission = 'manage_users'
             AND ou.is_active = 1 AND ${exclusion})`

/** Some active global administrator remains once the assignment named by `assignmentIdExpr` is gone. */
export const otherAdminWithoutAssignment = (assignmentIdExpr: string) =>
  OTHER_ACTIVE_GLOBAL_ADMIN(`oa.id != ${assignmentIdExpr}`)

/** Some active global administrator other than the account named by `userIdExpr` remains. */
export const otherAdminWithoutUser = (userIdExpr: string) =>
  OTHER_ACTIVE_GLOBAL_ADMIN(`oa.user_id != ${userIdExpr}`)

/** Some active global administrator remains that does not go through the role named by `roleIdExpr`. */
export const otherAdminWithoutRole = (roleIdExpr: string) =>
  OTHER_ACTIVE_GLOBAL_ADMIN(`oa.role_id != ${roleIdExpr}`)

/** `roleIdExpr` is assigned at {@link GLOBAL_SCOPE} to at least one account. */
export const roleHasGlobalAssignment = (roleIdExpr: string) =>
  `EXISTS (SELECT 1 FROM user_role_assignments ra WHERE ra.role_id = ${roleIdExpr} AND ra.scope = '${GLOBAL_SCOPE}')`

/** `roleIdExpr` currently carries `manage_users`. */
export const roleCarriesManageUsers = (roleIdExpr: string) =>
  `EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = ${roleIdExpr} AND rp.permission = 'manage_users')`

/** The account named by `userIdExpr` holds `manage_users` at {@link GLOBAL_SCOPE} through some assignment. */
export const holdsGlobalManageUsers = (userIdExpr: string) =>
  `EXISTS (SELECT 1 FROM user_role_assignments ga
           JOIN role_permissions grp ON grp.role_id = ga.role_id
           WHERE ga.user_id = ${userIdExpr} AND ga.scope = '${GLOBAL_SCOPE}' AND grp.permission = 'manage_users')`
