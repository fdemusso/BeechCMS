// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
import { resolveEmailLocale } from './email.types'

describe('resolveEmailLocale', () => {
  it.each(['en', 'it'])('keeps the supported language %s', (locale) => {
    expect(resolveEmailLocale(locale)).toBe(locale)
  })

  // The dashboard speaks these languages, but no email template exists for them yet.
  it.each(['es', 'de', 'fr'])('falls back to en for %s, which has no template', (locale) => {
    expect(resolveEmailLocale(locale)).toBe('en')
  })

  it.each([
    ['it-IT', 'it'],
    ['it_IT', 'it'],
    ['IT', 'it'],
    [' en-GB ', 'en'],
  ])('reduces %j to its base language %s', (raw, expected) => {
    expect(resolveEmailLocale(raw)).toBe(expected)
  })

  it('falls back to en when the base language of a regional tag has no template', () => {
    expect(resolveEmailLocale('de-AT')).toBe('en')
  })

  it.each([undefined, null, 42, {}, '', 'xx', '-'])('falls back to en for the unusable value %j', (raw) => {
    expect(resolveEmailLocale(raw)).toBe('en')
  })
})
