// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

export const PERMISSION_GROUPS = [
  {
    id: "content",
    titleKey: "rbac.roles.groupContent",
    defaultTitle: "Content",
    permissions: [
      "content:read",
      "content:create",
      "content:update",
      "content:delete",
    ] as const,
  },
  {
    id: "system",
    titleKey: "rbac.roles.groupSystem",
    defaultTitle: "System",
    permissions: [
      "manage_users",
      "manage_roles",
      "view_analytics",
    ] as const,
  },
] as const
