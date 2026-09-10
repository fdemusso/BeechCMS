// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Permission } from "@beechcms/core"
import { Eye, Plus, Edit, Trash2, Users, ShieldCheck, Chart } from "reicon-react"
import type React from "react"

export interface PermissionMeta {
  readonly icon: React.ComponentType<{ className?: string }>
  readonly translationKey: string
  readonly defaultLabel: string
}

export const PERMISSION_METADATA: Record<Permission, PermissionMeta> = {
  "content:read": { icon: Eye, translationKey: "rbac.permissions.content:read", defaultLabel: "Read content" },
  "content:create": { icon: Plus, translationKey: "rbac.permissions.content:create", defaultLabel: "Create content" },
  "content:update": { icon: Edit, translationKey: "rbac.permissions.content:update", defaultLabel: "Update content" },
  "content:delete": { icon: Trash2, translationKey: "rbac.permissions.content:delete", defaultLabel: "Delete content" },
  "manage_users": { icon: Users, translationKey: "rbac.permissions.manage_users", defaultLabel: "Manage users" },
  "manage_roles": { icon: ShieldCheck, translationKey: "rbac.permissions.manage_roles", defaultLabel: "Manage roles" },
  "view_analytics": { icon: Chart, translationKey: "rbac.permissions.view_analytics", defaultLabel: "View analytics" },
}
