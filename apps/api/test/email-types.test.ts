// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from 'vitest'
import { resolveEmailLocale, SUPPORTED_EMAIL_LOCALES } from '../src/shared/email/email.types'

describe('email/email.types', () => {
  describe('resolveEmailLocale', () => {
    it('returns a supported locale when passed a valid string', () => {
      for (const locale of SUPPORTED_EMAIL_LOCALES) {
        expect(resolveEmailLocale(locale)).toBe(locale)
      }
    })

    it('falls back to en for an unknown locale string', () => {
      expect(resolveEmailLocale('fr')).toBe('en')
      expect(resolveEmailLocale('de')).toBe('en')
    })

    it('falls back to en for non-string inputs', () => {
      expect(resolveEmailLocale(null)).toBe('en')
      expect(resolveEmailLocale(undefined)).toBe('en')
      expect(resolveEmailLocale(42)).toBe('en')
      expect(resolveEmailLocale({ locale: 'it' })).toBe('en')
    })

    it('falls back to en for an empty string', () => {
      expect(resolveEmailLocale('')).toBe('en')
    })
  })
})
