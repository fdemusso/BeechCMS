// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module engine/schema-fingerprint
 * A deterministic name for "the shape this API answers in".
 *
 * Computed from live seed definitions (`introspectSeedDefinitions`), embedded in generated client
 * types at build time (sprint 3), returned on every public response as `X-Schema-Revision`
 * (sprint 4), and compared by the client at request time (sprint 5). Both ends MUST compute it
 * with this function — two implementations would be free to disagree, and a drift detector whose
 * ends disagree is worse than none.
 *
 * What is hashed is a CONTRACT PROJECTION, not the whole seed definition: labels, hints, dashboard
 * icons and layout cannot change a single response byte, and hashing them would fire a hard
 * `BeechProblem` in someone else's production client over a typo fix.
 */

import { canonicalStringify } from '../common/canonical-json.js'
import { resolvePolicies } from './policies.js'
import type { Branch, Seed } from './types.js'

/**
 * Bumped ONLY when the projection below or the canonical byte format changes — i.e. when
 * fingerprints computed by two builds are no longer comparable. It is carried in the fingerprint
 * string itself so a version skew reads as a mismatch instead of as an accidental match.
 */
export const SCHEMA_FINGERPRINT_VERSION = 1

/** The response-shape-bearing subset of a `Branch`. */
export interface ContractBranch {
  alias: string
  type: Branch['type']
  format?: Branch['format']
  multiple?: boolean
  options?: string[]
  requiredOnCreate: boolean
  requiredOnUpdate: boolean
  targetSeed?: string
  /** From `resolvePolicies`, so an explicitly-written default hashes like an omitted one. */
  visibility: 'full' | 'masked' | 'hidden'
  publicRead: boolean
  publicEdit: boolean
  minItems?: number
  maxItems?: number
  /** Repeater sub-fields, same projection, recursively. */
  fields?: ContractBranch[]
}

/** The response-shape-bearing subset of a `Seed`. */
export interface ContractSeed {
  slug: string
  displayNameAlias: string
  allowDrafts: boolean
  allowPublicRead: boolean
  allowPublicPost: boolean
  allowPublicEdit: boolean
  branches: ContractBranch[]
}

/** The exact value that gets canonicalized and hashed. */
export interface SchemaContract {
  fingerprintVersion: number
  seeds: ContractSeed[]
}

function projectBranch(branch: Branch): ContractBranch {
  const policies = resolvePolicies(branch)
  return {
    alias: branch.alias,
    type: branch.type,
    ...(branch.format !== undefined ? { format: branch.format } : {}),
    ...(branch.multiple !== undefined ? { multiple: branch.multiple } : {}),
    // Option order is the contract: it is the order a select renders and a union type lists.
    ...(branch.options !== undefined ? { options: [...branch.options] } : {}),
    requiredOnCreate: branch.requiredOnCreate ?? false,
    requiredOnUpdate: branch.requiredOnUpdate ?? false,
    ...(branch.targetSeed !== undefined ? { targetSeed: branch.targetSeed } : {}),
    visibility: policies.visibility,
    publicRead: policies.public,
    publicEdit: policies.publicEdit,
    ...(branch.minItems !== undefined ? { minItems: branch.minItems } : {}),
    ...(branch.maxItems !== undefined ? { maxItems: branch.maxItems } : {}),
    ...(branch.fields ? { fields: branch.fields.map(projectBranch) } : {}),
  }
}

/**
 * Reduces seeds to what a response shape depends on.
 *
 * Deliberately EXCLUDED, and each for a reason a future reader must not "fix":
 * - `id` (`br_XX`) — a stable internal handle; it never appears in a payload, and minting order
 *   differs between an environment built by migration and one grown through the dashboard.
 * - `label`, `labelPlural`, `hint`, `dashboard`, `layout` — presentation, never response shape.
 * - `retentionDays`, `onDelete`, `policies.search|filter|sort`, `numberOptions`, `fileOptions`,
 *   `policies.classification|privacy` — behaviour and storage concerns that leave the response
 *   shape identical. (`privacy` DOES change a stored value's encoding, but the API type stays
 *   `string`; drift there is a data concern, not a type concern.)
 * - anything physical (column order, index names) — see the VETO Audit.
 *
 * Seeds are sorted by slug; BRANCH ORDER IS PRESERVED, because it is the declared field order the
 * generated types and the dashboard form both follow.
 */
export function projectSchemaContract(seeds: Seed[]): SchemaContract {
  return {
    fingerprintVersion: SCHEMA_FINGERPRINT_VERSION,
    seeds: [...seeds]
      .sort((a, b) => a.slug.localeCompare(b.slug))
      .map(seed => ({
        slug: seed.slug,
        displayNameAlias: seed.displayNameAlias,
        allowDrafts: seed.allowDrafts ?? false,
        allowPublicRead: seed.allowPublicRead ?? false,
        allowPublicPost: seed.allowPublicPost ?? false,
        allowPublicEdit: seed.allowPublicEdit ?? false,
        branches: seed.branches.map(projectBranch),
      })),
  }
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * `v{VERSION}:{32 lowercase hex}` — SHA-256 over the canonical JSON of the contract projection,
 * truncated to 128 bits.
 *
 * Truncation is deliberate: this value travels on EVERY public response as `X-Schema-Revision`,
 * and 128 bits of a SHA-256 digest carries no realistic collision risk for a value space of a few
 * hundred schema revisions. It is a revision marker, never a security token.
 *
 * Web Crypto only — the same API the Worker and Node ≥ 18 both expose, as `webhook-crypto.ts`
 * already relies on. `@beechcms/core` gains no dependency.
 */
export async function computeSchemaFingerprint(seeds: Seed[]): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalStringify(projectSchemaContract(seeds)))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return `v${SCHEMA_FINGERPRINT_VERSION}:${toHex(digest).slice(0, 32)}`
}
