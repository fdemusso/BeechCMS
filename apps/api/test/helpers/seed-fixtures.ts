// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { GLOBAL_SCOPE, SUPER_ADMIN_ROLE_NAME } from '@beechcms/core'
import type { D1TestDatabase } from './d1-test-database'

export interface TestUser {
  id: string
  email: string
  password_hash: string
  name?: string
  /**
   * Grants the seeded `SuperAdmin` role at `'*'` unless `false`, which is what every
   * pre-RBAC suite assumes. `false` builds an account with no authority at all
   * (zero-trust cases); seed narrower assignments by hand.
   */
  grantSuperAdmin?: boolean
}

export async function seedTestUsers(db: D1TestDatabase, users: TestUser[]): Promise<void> {
  for (const u of users) {
    await db.prepare(
      'INSERT OR IGNORE INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)'
    ).bind(u.id, u.email, u.password_hash, u.name ?? null).run()

    const grant = u.grantSuperAdmin ?? true
    if (!grant) continue

    // The role id is minted per-database by 0000_v040_base.sql — resolve it by name.
    await db.prepare(
      `INSERT OR IGNORE INTO user_role_assignments (id, user_id, role_id, scope)
       SELECT ?, ?, r.id, ? FROM roles r WHERE r.name = ?`
    ).bind(`ura_${u.id}`, u.id, GLOBAL_SCOPE, SUPER_ADMIN_ROLE_NAME).run()
  }
}
