// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Context } from 'hono'

/**
 * Resolves the OCC guard for PUT /:slug/:id: an `If-Match` header (weak or strong, quoted or
 * bare) takes precedence over a `updated_at` field in the body, since If-Match is the
 * HTTP-native mechanism. Returns undefined when neither is present or the value doesn't parse
 * to a finite number, which callers treat as "no guard requested".
 */
export function resolveIfMatch(context: Context, body: Record<string, unknown>): number | undefined {
  const header = context.req.header('If-Match')
  if (header !== undefined) {
    return parseVersion(header.replace(/^W\//, '').replace(/^"|"$/g, ''))
  }
  return parseVersion(body.updated_at)
}

// `Number(null)` and `Number('')` are 0: absent or blank values must mean "no guard", not version 0.
function parseVersion(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string' && value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}
