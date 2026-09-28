// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Seed } from '@beechcms/core'

export type PublicOperation = 'read' | 'add' | 'edit'

function isAllowed(seed: Seed, operation: PublicOperation): boolean {
  if (operation === 'read') return seed.allowPublicRead === true
  if (operation === 'add') return seed.allowPublicPost === true
  return seed.allowPublicEdit === true
}

export function checkPublicOperation(seed: Seed, operation: PublicOperation) {
  if (isAllowed(seed, operation)) {
    return { ok: true } as const
  }

  return {
    ok: false,
    error: {
      error: 'Forbidden',
      message: `Public ${operation.toUpperCase()} is not allowed for content type '${seed.slug}'.`,
    },
  } as const
}
