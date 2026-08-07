// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { resolvePolicies, sha256hex, filterEntryForActor } from '@beechcms/core'
import type { Seed, ActorContext } from '@beechcms/core'

class PrivacyPolicyError extends Error {
  readonly status = 501 as const
  constructor(message: string) {
    super(message)
    this.name = 'PrivacyPolicyError'
  }
}

export { PrivacyPolicyError }

/** Applica la privacy policy ai campi del payload prima della scrittura su DB. */
export async function applyPrivacy(
  data: Record<string, unknown>,
  seed: Seed,
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {}
  for (const [alias, value] of Object.entries(data)) {
    const branch = seed.branches.find((b) => b.alias === alias)
    if (!branch) {
      result[alias] = value
      continue
    }
    const { privacy } = resolvePolicies(branch)
    if (privacy === 'encrypt') {
      throw new PrivacyPolicyError(
        `Field '${alias}' uses 'encrypt' privacy which is not yet implemented.`,
      )
    }
    if (privacy === 'hash' && value != null) {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value)
      result[alias] = await sha256hex(serialized)
    } else {
      result[alias] = value
    }
  }
  return result
}

/** Applica la visibility policy ai campi del payload in uscita verso il client. */
export function applyVisibility(
  data: Record<string, unknown>,
  seed: Seed,
  actor?: ActorContext,
): Record<string, unknown> {
  const resolvedActor = actor ?? { type: 'authenticated' }
  return filterEntryForActor(data, seed, resolvedActor)
}

