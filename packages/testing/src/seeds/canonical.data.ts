// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { JwtClaims } from '@beechcms/core'

export interface CanonicalUser {
  readonly id: string
  readonly email: string
  readonly password: string
  /** bcrypt hash of `password`, precomputed — hashing at test time costs ~100ms per user. */
  readonly passwordHash: string
  readonly name: string
  /** Stored verbatim in `users.role`, which is CHECK-constrained to 'admin' | 'editor'. */
  readonly role: 'admin' | 'editor'
  /** Grants `SuperAdmin` at `GLOBAL_SCOPE`. Defaults to true for `role === 'admin'`. */
  readonly grantSuperAdmin?: boolean
}

const CANONICAL_PASSWORD = 'password123'
// bcryptjs hash of CANONICAL_PASSWORD, precomputed — hashing at test time costs ~100ms per user.
const CANONICAL_PASSWORD_HASH = '$2a$10$HQBNa3xrHKgyPlev/52mqOHFfjtfkk7vgOKvNNtRhH0qiIHE7ZvFG'

export const CANONICAL_USERS = {
  admin: {
    id: '8e001bb7-f5f5-49cc-8eca-f985c14a6d90',
    email: 'admin@beech.test',
    password: CANONICAL_PASSWORD,
    passwordHash: CANONICAL_PASSWORD_HASH,
    name: 'Canonical Admin',
    role: 'admin',
  },
  editor: {
    id: '0c30b2fc-5fa8-49ef-be8a-a15cd2ea7863',
    email: 'editor@beech.test',
    password: CANONICAL_PASSWORD,
    passwordHash: CANONICAL_PASSWORD_HASH,
    name: 'Canonical Editor',
    role: 'editor',
    grantSuperAdmin: false,
  },
  // 'viewer' has no matching users.role value (CHECK admin|editor). This is an
  // editor-shaped account deliberately given no RBAC role assignment, for
  // permission-denial and non-owner assertions.
  viewer: {
    id: 'eb9aa066-3d67-4234-a5fb-7461d6450f5b',
    email: 'viewer@beech.test',
    password: CANONICAL_PASSWORD,
    passwordHash: CANONICAL_PASSWORD_HASH,
    name: 'Canonical Viewer',
    role: 'editor',
    grantSuperAdmin: false,
  },
} as const satisfies Record<string, CanonicalUser>

/**
 * A content entry provisioned through the real `POST /api/content/:slug` route.
 * No `id` field: production mints entry ids server-side
 * (`context.get('idGenerator').uuid()`), so a client-supplied id would be
 * silently ignored — `seedCanonicalEntries()` reports back the minted id.
 */
export interface CanonicalEntry {
  readonly seedSlug: string
  readonly data: Record<string, unknown>
}

export const CANONICAL_ENTRIES: readonly CanonicalEntry[] = [
  {
    seedSlug: 'posts',
    data: { slug: 'canonical-post', status: 'published', title: 'Canonical Post', internal_note: 'SECRET' },
  },
] as const

/** Exported so suites can assert the format instead of hardcoding a literal. */
export const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export type CanonicalUserKey = keyof typeof CANONICAL_USERS
export type CanonicalClaims = JwtClaims
