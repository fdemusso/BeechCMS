// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from 'vitest'
import { isValidAccountEmail } from './account-email'

// Shared account validation must preserve login's shape and normalized length limit.
const cases: [string, boolean][] = [
  ['admin@beech.test', true],
  ['  ADMIN@BEECH.TEST  ', true],
  ['admin+tag@sub.beech.test', true],
  [`${'a'.repeat(243)}@beech.test`, true],
  [`${'a'.repeat(244)}@beech.test`, false],
  // Lowercasing U+0130 expands it to two characters; length applies after normalization.
  [`${'İ'.repeat(243)}@beech.test`, false],
  ['admin@example..com', false],
  ['admin@.example.com', false],
  ['admin@example.com.', false],
  ['admin@localhost', false],
  ['admin name@beech.test', false],
  ['admin@@beech.test', false],
  ['@beech.test', false],
  ['', false],
]

describe('isValidAccountEmail', () => {
  it.each(cases)('validates %s as %s under the shared account rules', (email, expected) => {
    const result = isValidAccountEmail(email)

    expect(result).toBe(expected)
  })
})
