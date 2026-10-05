// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { filterEntryForActor } from '@beechcms/core'
import type { Seed, ActorContext } from '@beechcms/core'

class PrivacyPolicyError extends Error {
  readonly status = 501 as const
  constructor(message: string) {
    super(message)
    this.name = 'PrivacyPolicyError'
  }
}

export { PrivacyPolicyError }

/**
 * Privacy pass-through. `encrypt` and `hash` fields reach the repository as plaintext,
 * which encrypts or HMAC-hashes them exactly once via PrivacyService.
 * @param data - Raw record fields object.
 * @param _seed - Seed definition containing field policy definitions.
 * @returns A Promise resolving to the data payload.
 */
export async function applyPrivacy(
  data: Record<string, unknown>,
  _seed: Seed,
): Promise<Record<string, unknown>> {
  return { ...data }
}

/**
 * Applies visibility policy and context-aware field filtering to outgoing API payloads.
 * Delegates to {@link filterEntryForActor} using the supplied {@link ActorContext}.
 *
 * @param data - Raw record data object from repository.
 * @param seed - Content type seed definition.
 * @param actor - Context of the caller (defaults to authenticated).
 * @returns Filtered data record containing only authorized fields for the actor.
 */
export function applyVisibility(
  data: Record<string, unknown>,
  seed: Seed,
  actor?: ActorContext,
): Record<string, unknown> {
  const resolvedActor = actor ?? { type: 'authenticated' }
  return filterEntryForActor(data, seed, resolvedActor)
}


