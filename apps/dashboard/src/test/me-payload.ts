// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { PERMISSIONS } from "@beechcms/core"

const USER_ID = "0f6c2d1e-8b34-4a57-9e10-3c4d5e6f7a81"

export interface MePermissions {
  global: string[]
  byScope: Record<string, string[]>
}

/** Every permission at the global scope: a caller for whom no widget is hidden. */
export const FULL_AUTHORITY: MePermissions = { global: [...PERMISSIONS], byScope: {} }

/** The `GET /api/settings/me` JSON for a caller holding `permissions`. */
export function meResponseBody(permissions: MePermissions) {
  return {
    id: USER_ID,
    email: "ada@example.com",
    name: "Ada",
    surname: null,
    avatarUrl: null,
    notificationPrefs: { contentCreate: true, contentUpdate: true, contentDelete: true, mediaUpload: false },
    permissions,
    isDeveloper: false,
    manageableScopes: [],
  }
}
