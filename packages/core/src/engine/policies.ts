// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { ActorContext, Branch, DataClassification, Seed } from './types.js'

export async function sha256hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function verifyHashField(stored: string, candidate: string): Promise<boolean> {
  return stored === (await sha256hex(candidate))
}

export interface ResolvedClassification {
  classification: DataClassification
  storage: 'plain' | 'encrypt' | 'hash'
  publicVisibility: 'full' | 'hidden'
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
 */
export function resolvePolicies(branch: Branch): Required<NonNullable<Branch['policies']>> {
  const resolved = resolveClassification(branch)
  const isRepeater = branch.type === 'repeater'

  const defaultVisibility = resolved.publicVisibility === 'hidden' ? 'hidden' : 'full'
  const isPublicAllowed = branch.policies?.public ?? (resolved.publicVisibility === 'full')

  return {
    classification: resolved.classification,
    privacy: resolved.storage,
    visibility: branch.policies?.visibility ?? defaultVisibility,
    search: isRepeater ? false : branch.policies?.search ?? true,
    filter: isRepeater ? false : branch.policies?.filter ?? true,
    sort: isRepeater ? false : branch.policies?.sort ?? true,
    public: isPublicAllowed,
  }
}

const SYSTEM_FIELDS = new Set(['id', 'slug', 'status', 'created_at', 'updated_at', 'version', 'has_pending_draft'])

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
    } else {
      // Authenticated actor check
      if (resolved.authVisibility === 'hidden') continue
    }

    // Explicit visibility override check
    if (branch.policies?.visibility === 'hidden') continue

    // Masking rule check
    if (branch.policies?.visibility === 'masked') {
      result[key] = typeof value === 'string' && value.length > 0 ? '••••••••' : null
    } else {
      result[key] = value
    }
  }

  return result
}

