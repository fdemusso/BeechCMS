// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Seed } from '@beechcms/core'

export type PublicOperation = 'read' | 'add' | 'edit'

/** Seed flag that opens each public operation; also named in the 403 detail so the integrator knows what to set. */
const OPERATION_FLAG = {
  read: 'allowPublicRead',
  add: 'allowPublicPost',
  edit: 'allowPublicEdit',
} as const satisfies Record<PublicOperation, keyof Seed>

function isAllowed(seed: Seed, operation: PublicOperation): boolean {
  return seed[OPERATION_FLAG[operation]] === true
}

/** True when at least one public operation reaches the seed; any other seed must look unknown to a public caller. */
export function isPubliclyExposed(seed: Seed): boolean {
  return isAllowed(seed, 'read') || isAllowed(seed, 'add') || isAllowed(seed, 'edit')
}

function refusalMessage(seed: Seed, operation: PublicOperation): string {
  const flag = OPERATION_FLAG[operation]
  const base = `Public ${operation.toUpperCase()} is not allowed for content type '${seed.slug}': enable ${flag} on the seed (Permissions in the seed builder)`
  // Only add has a key-based bypass: public-add trusts a secret-key write without allowPublicPost.
  return operation === 'add' ? `${base}, or create the entry from a server with the secret key.` : `${base}.`
}

export function checkPublicOperation(seed: Seed, operation: PublicOperation) {
  if (isAllowed(seed, operation)) {
    return { ok: true } as const
  }

  return {
    ok: false,
    error: {
      error: 'Forbidden',
      message: refusalMessage(seed, operation),
    },
  } as const
}
