// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { isRichtextEnvelopeV1 } from '../../content/richtext/richtext.js'
import { cleanString, isPlainObject } from './primitives.js'
import { isRichtextDocEmpty } from './richtext-sanitizer.js'

/**
 * Checks if a value is effectively empty (e.g. null, undefined, empty string, empty array, or empty rich text).
 *
 * Shared by top-level required-field detection (`index.ts`) and repeater item validation
 * (`schema-builders.ts`) so both tiers apply the same emptiness rule to required fields.
 *
 * @param value - The value to check.
 * @param branchType - The type of the branch being checked.
 * @returns True if effectively empty, false otherwise.
 */
export function isEffectivelyEmpty(value: unknown, branchType?: string): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return cleanString(value).length === 0
  if (Array.isArray(value)) return value.length === 0
  if (isPlainObject(value)) {
    // Richtext envelope: delegate to the richtext emptiness check.
    if (isRichtextEnvelopeV1(value)) return isRichtextDocEmpty(value.doc)
    // Raw TipTap doc root: only delegate for richtext branches to avoid misclassifying generic json fields.
    if (branchType === 'richtext' && value.type === 'doc') return isRichtextDocEmpty(value)
    return Object.keys(value).length === 0
  }
  return false
}
