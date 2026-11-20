// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from 'vitest'
import {
  EMPTY_UI_PREFERENCES,
  PALETTE_PINS_MAX,
  PALETTE_PIN_ID_MAX_LENGTH,
  parseStoredUiPreferences,
  uiPreferencesByteLength,
  uiPreferencesSchema,
  type UiPreferences,
  type UiPreferencesInput,
} from './ui-preferences.js'

// Type-level guard: the exported shapes are the contract, whatever the schema infers.
const _shapeGuard: UiPreferencesInput = { palettePins: ['nav:/content'] }
const _outputGuard: UiPreferences = { palettePins: [] }
void _shapeGuard
void _outputGuard

const distinctIds = (count: number, make: (index: number) => string): string[] =>
  Array.from({ length: count }, (_, index) => make(index))

const malformedPins: ReadonlyArray<readonly [string, unknown]> = [
  ['more pins than the cap', distinctIds(PALETTE_PINS_MAX + 1, (i) => `nav:${i}`)],
  ['an empty id', ['']],
  ['an id over the length cap', ['a'.repeat(PALETTE_PIN_ID_MAX_LENGTH + 1)]],
  ['a duplicated id', ['nav:/content', 'nav:/content']],
  ['a non-string id', [42]],
  ['a non-array value', 'nav:/content'],
]

describe('uiPreferencesSchema', () => {
  it('an empty object parses to an empty pin list', () => {
    const result = uiPreferencesSchema.safeParse({})

    expect(result.success).toBe(true)
    expect(result.data).toEqual({ palettePins: [] })
  })

  it('an ordered list of distinct ids parses unchanged, order preserved', () => {
    const palettePins = ['nav:settings', 'nav:/content', 'content:open:posts']

    const result = uiPreferencesSchema.safeParse({ palettePins })

    expect(result.data).toEqual({ palettePins })
  })

  it('an unknown key is refused with one unrecognized_keys issue naming it', () => {
    const result = uiPreferencesSchema.safeParse({ theme: 'dark' })

    expect(result.success).toBe(false)
    expect(result.error?.issues).toHaveLength(1)
    expect(result.error?.issues[0]).toMatchObject({ code: 'unrecognized_keys', keys: ['theme'] })
  })

  it.each(malformedPins)('a pins value with %s is refused at palettePins', (_cause, palettePins) => {
    const result = uiPreferencesSchema.safeParse({ palettePins })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path[0]).toBe('palettePins')
  })

  it('eight distinct ids of 200 two-byte characters are refused by one root custom issue', () => {
    // Each id is within the length cap, so only the byte cap can refuse it.
    const palettePins = distinctIds(PALETTE_PINS_MAX, (i) => `${i}${'é'.repeat(PALETTE_PIN_ID_MAX_LENGTH - 1)}`)

    const result = uiPreferencesSchema.safeParse({ palettePins })

    expect(result.success).toBe(false)
    expect(result.error?.issues).toHaveLength(1)
    expect(result.error?.issues[0]).toMatchObject({ code: 'custom', path: [] })
  })

  it('eight distinct ASCII ids of 200 characters are accepted', () => {
    // Regression guard: the byte cap must never bite on ordinary ids.
    const palettePins = distinctIds(PALETTE_PINS_MAX, (i) => `${i}${'a'.repeat(PALETTE_PIN_ID_MAX_LENGTH - 1)}`)

    const result = uiPreferencesSchema.safeParse({ palettePins })

    expect(result.success).toBe(true)
  })
})

describe('parseStoredUiPreferences', () => {
  const invalidStoredValues = ['not json', 'null', '[]', '{"theme":"dark"}', '{"palettePins":"nav:/content"}']

  it.each(invalidStoredValues)('the stored value %s reads as the empty container', (stored) => {
    const result = parseStoredUiPreferences(stored)

    expect(result).toBe(EMPTY_UI_PREFERENCES)
  })

  it('a stored empty object reads as an empty pin list', () => {
    const result = parseStoredUiPreferences('{}')

    expect(result).toEqual({ palettePins: [] })
  })

  it('a valid stored container yields its pins in order', () => {
    const result = parseStoredUiPreferences('{"palettePins":["nav:settings","nav:/content"]}')

    expect(result.palettePins).toEqual(['nav:settings', 'nav:/content'])
  })

  it('the shared empty container is frozen, array included', () => {
    expect(Object.isFrozen(EMPTY_UI_PREFERENCES)).toBe(true)
    expect(Object.isFrozen(EMPTY_UI_PREFERENCES.palettePins)).toBe(true)
  })
})

describe('uiPreferencesByteLength', () => {
  it('counts UTF-8 bytes, not UTF-16 code units', () => {
    const preferences: UiPreferences = { palettePins: ['é'.repeat(10)] }

    const bytes = uiPreferencesByteLength(preferences)

    expect(bytes).toBeGreaterThan(JSON.stringify(preferences).length)
    expect(bytes).toBe(JSON.stringify(preferences).length + 10)
  })
})
