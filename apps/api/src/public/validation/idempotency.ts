// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { canonicalStringify, sha256hex } from '@beechcms/core'

export function parseIdempotencyKey(rawValue: string | undefined): string | null {
  if (!rawValue) return null
  const key = rawValue.trim()
  if (!key || key.length > 128) return null
  return key
}

type FingerprintInput = {
  seedSlug: string
  statusValue: unknown
  slug: string | null
  data: Record<string, unknown>
}

// Keys are sorted at every depth: JSON branches keep the client's member order through sanitizing,
// and a retry with the same meaning must hit the same fingerprint.
export function buildRequestFingerprint(input: FingerprintInput): Promise<string> {
  return sha256hex(canonicalStringify({ seedSlug: input.seedSlug, statusValue: input.statusValue, slug: input.slug, data: input.data }))
}
