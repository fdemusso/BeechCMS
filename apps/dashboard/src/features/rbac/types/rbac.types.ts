// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { InferRequestType, InferResponseType } from "hono/client"
import type { Permission, RoleRecord, Scope } from "@beechcms/core"
import type { rpc } from "@/lib/rpc"

export type { Permission, RoleRecord, Scope }

// Read off the routes, not restated: the API is the only place these shapes are defined.
type Rbac = typeof rpc.api.rbac

/** `GET /api/rbac/users` row: account + its RAW (non-decayed) assignments. */
export type AccountView = InferResponseType<Rbac["users"]["$get"]>["users"][number]

/** `GET /api/rbac/users/:id/assignments` row. `active: false` = the scope's seed is
 *  currently deleted/inactive: the row still exists and must stay removable. */
export type AssignmentView = InferResponseType<Rbac["users"][":userId"]["assignments"]["$get"]>["assignments"][number]

export type InvitationView = InferResponseType<Rbac["invitations"]["$get"]>["invitations"][number]

export type CreateUserPayload = InferRequestType<Rbac["users"]["$post"]>["json"]

/** `permissions` has at least one entry: the server rejects an empty array (422). */
export type RoleBodyPayload = InferRequestType<Rbac["roles"]["$post"]>["json"]

export type CreateAssignmentPayload = InferRequestType<Rbac["assignments"]["$post"]>["json"]
export type CreateInvitationPayload = InferRequestType<Rbac["invitations"]["$post"]>["json"]
