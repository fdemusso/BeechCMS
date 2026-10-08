// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { ActorContext, Branch, DataClassification, Seed } from '../types.js'
import { isLocaleDictionary, isLocalizedBranch } from '../localization/localization.js'
import { timingSafeEqual } from '../../webhooks/webhook-crypto.js'

/**
 * Computes an un-salted SHA-256 hex digest of a string value.
 * Used for basic digest operations.
 * @param value - The raw string value to hash.
 * @returns A Promise resolving to a 64-character hex string.
 */
export async function sha256hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Verifies if a candidate string matches a stored SHA-256 hash digest, comparing in constant time.
 * @param stored - The expected 64-character SHA-256 hex digest.
 * @param candidate - The raw candidate string to verify.
 * @returns A Promise resolving to true if candidate matches stored digest, false otherwise.
 */
export async function verifyHashField(stored: string, candidate: string): Promise<boolean> {
  return timingSafeEqual(stored, await sha256hex(candidate))
}

/**
 * Resolved classification rules for a branch, bundling storage strategy and API visibility defaults.
 */
export interface ResolvedClassification {
  /** Canonical data classification tier. */
  classification: DataClassification
  /** Storage mechanism at rest (`plain`, `encrypt` via AES-GCM, or `hash` via HMAC-SHA256). */
  storage: 'plain' | 'encrypt' | 'hash'
  /** Default visibility rule for unauthenticated public API endpoints (`full` or `hidden`). */
  publicVisibility: 'full' | 'hidden'
  /** Default visibility rule for authenticated API endpoints (`full` or `hidden`). */
  authVisibility: 'full' | 'hidden'
}

/** Normalizes raw policy strings to canonical DataClassification enum. */
export function normalizeClassification(raw?: string): DataClassification {
  if (!raw) return 'public'
  const lower = raw.toLowerCase()
  if (lower === 'confidential') return 'confidential'
  if (lower === 'restricted' || lower === 'hash') return 'restricted'
  if (lower === 'encrypt') return 'confidential'
  if (lower === 'internal') return 'internal'
  return 'public'
}

/**
 * Resolves the 4-tier DataClassification for a branch, bundling its storage
 * strategy at rest and its API visibility rules (public vs auth context).
 * @param branch - The seed branch definition to inspect.
 * @returns The resolved classification details and visibility rules.
 */
export function resolveClassification(branch: Branch): ResolvedClassification {
  const rawClassification = branch.policies?.classification ?? branch.policies?.privacy
  const classification = normalizeClassification(rawClassification)

  switch (classification) {
    case 'confidential':
      return {
        classification: 'confidential',
        storage: 'encrypt',
        publicVisibility: 'hidden',
        authVisibility: 'full',
      }
    case 'restricted':
      return {
        classification: 'restricted',
        storage: 'hash',
        publicVisibility: 'hidden',
        authVisibility: 'hidden',
      }
    case 'internal':
      return {
        classification: 'internal',
        storage: 'plain',
        publicVisibility: 'hidden',
        authVisibility: 'full',
      }
    case 'public':
    default:
      return {
        classification: 'public',
        storage: 'plain',
        publicVisibility: 'full',
        authVisibility: 'full',
      }
  }
}

/**
 * Resolves branch policies applying all defaults and classification rules.
 * @param branch - The seed branch definition to inspect.
 * @returns Complete required policies object for the branch.
 */
export function resolvePolicies(branch: Branch): Required<NonNullable<Branch['policies']>> {
  const resolved = resolveClassification(branch)
  const isRepeater = branch.type === 'repeater'
  const isEncryptedOrHashed = resolved.storage !== 'plain'

  const defaultVisibility = resolved.authVisibility
  const isPublicAllowed = branch.policies?.public ?? (resolved.publicVisibility === 'full')

  const visibility = branch.policies?.visibility ?? defaultVisibility
  // Concealed values must not be queryable: filter/sort/search leak them
  const isConcealed = visibility === 'hidden' || visibility === 'masked'

  const defaultFilter = isRepeater || resolved.storage === 'hash' ? false : branch.policies?.filter ?? !isConcealed
  const defaultSort = isRepeater || isEncryptedOrHashed ? false : branch.policies?.sort ?? !isConcealed
  const defaultSearch = isRepeater || isEncryptedOrHashed ? false : branch.policies?.search ?? !isConcealed

  // publicEdit default: true for public fields (unless public: false), false for confidential/internal/restricted
  const defaultPublicEdit = resolved.classification === 'public'
    ? (branch.policies?.publicEdit ?? isPublicAllowed)
    : (branch.policies?.publicEdit ?? false)

  return {
    classification: resolved.classification,
    privacy: resolved.storage,
    visibility,
    search: defaultSearch,
    filter: defaultFilter,
    sort: defaultSort,
    public: isPublicAllowed,
    publicEdit: defaultPublicEdit,
  }
}

const MASK = '••••••••'

/**
 * The masked form of a value. A localized dictionary (a `?lang=all` read) masks each translation, exactly as
 * a single-language read masks the one translation it resolves to; before this, any object became `null`.
 */
function maskValue(branch: Branch, value: unknown): unknown {
  if (typeof value === 'string') return value.length > 0 ? MASK : null
  if (isLocalizedBranch(branch) && isLocaleDictionary(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([locale, translation]) => [
        locale,
        typeof translation === 'string' && translation.length > 0 ? MASK : null,
      ]),
    )
  }
  return null
}

const SYSTEM_FIELDS = new Set(['id', 'slug', 'status', 'created_at', 'updated_at', 'version', 'has_pending_draft'])

/**
 * Filters entry payload fields based on the caller's {@link ActorContext} and branch classification tier.
 * 
 * Rules:
 * - Public actor: receives `public` fields; `internal`, `confidential`, and `restricted` fields are omitted.
 * - Authenticated actor: receives `public`, `internal`, and `confidential` fields; `restricted` fields are ALWAYS omitted.
 * - System actor: receives all fields including `restricted` (used for internal worker/automation orchestration).
 *
 * @param data - Raw record fields object.
 * @param seed - Content type seed definition containing branch definitions.
 * @param actor - Context of the caller requesting the entry payload (defaults to authenticated).
 * @returns Filtered data record containing only authorized fields for the given actor context.
 */
export function filterEntryForActor(
  data: Record<string, unknown>,
  seed: Seed,
  actor: ActorContext = { type: 'authenticated' }
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(data)) {
    if (SYSTEM_FIELDS.has(key)) {
      result[key] = value
      continue
    }

    const branch = seed.branches.find((b) => b.alias === key)
    if (!branch) {
      // Pass through unknown/extra fields unless actor is public
      if (actor.type !== 'public') {
        result[key] = value
      }
      continue
    }

    const resolved = resolveClassification(branch)
    const isPublicActor = actor.type === 'public'
    const isSystemActor = actor.type === 'system'

    // System actor sees all fields including restricted
    if (isSystemActor) {
      result[key] = value
      continue
    }

    // Public actor check
    if (isPublicActor) {
      if (resolved.publicVisibility === 'hidden') continue
      if (branch.policies?.public === false) continue
    } else {
      // Authenticated actor check
      if (resolved.authVisibility === 'hidden') continue
    }

    // Explicit visibility override check
    if (branch.policies?.visibility === 'hidden') continue

    // Masking rule check
    if (branch.policies?.visibility === 'masked') {
      result[key] = maskValue(branch, value)
    } else {
      result[key] = value
    }
  }

  return result
}


