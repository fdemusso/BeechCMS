// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { D1TestDatabase } from './d1-test-database'

export interface TestUser {
  id: string
  email: string
  password_hash: string
  name?: string
  role?: string
}

export async function seedTestUsers(db: D1TestDatabase, users: TestUser[]): Promise<void> {
  for (const u of users) {
    await db.prepare(
      'INSERT OR IGNORE INTO users (id, email, password_hash, role, name) VALUES (?, ?, ?, ?, ?)'
    ).bind(u.id, u.email, u.password_hash, u.role ?? 'admin', u.name ?? null).run()
  }
}
