import type { Seed } from '@beech/core'

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
