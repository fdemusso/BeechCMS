// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { z } from 'zod'

/** Most pins a user can keep: the section must stay a shortcut (brief §4). */
export const PALETTE_PINS_MAX = 8
/** Longest stable palette item id accepted as a pin. */
export const PALETTE_PIN_ID_MAX_LENGTH = 200
/** Ceiling on the stored container: UTF-8 bytes of its JSON (brief rule 11). */
export const UI_PREFERENCES_MAX_BYTES = 2048

/** The container as stored and returned. */
export type UiPreferences = {
  /** Stable palette item ids, in display order. */
  palettePins: string[]
}

/** The container as a client may send it: every key optional. */
export type UiPreferencesInput = {
  palettePins?: string[]
}

/** UTF-8 byte length of the container's JSON, the quantity `UI_PREFERENCES_MAX_BYTES` bounds. */
export function uiPreferencesByteLength(preferences: UiPreferences): number {
  return new TextEncoder().encode(JSON.stringify(preferences)).length
}

/**
 * The per-user UI preferences container (`users.ui_prefs`). Closed keys: an unknown key is refused.
 * A key left out takes its default, so a PUT body replaces the whole container.
 */
export const uiPreferencesSchema: z.ZodType<UiPreferences, UiPreferencesInput> = z
  .strictObject({
    palettePins: z
      .array(z.string().min(1).max(PALETTE_PIN_ID_MAX_LENGTH))
      .max(PALETTE_PINS_MAX)
      .refine((pins) => new Set(pins).size === pins.length)
      .default([]),
  })
  .refine((preferences) => uiPreferencesByteLength(preferences) <= UI_PREFERENCES_MAX_BYTES)

/** The container of a user who has never written one. */
export const EMPTY_UI_PREFERENCES: UiPreferences = Object.freeze({
  palettePins: Object.freeze([]) as unknown as string[],
})

/**
 * Reads a stored `users.ui_prefs` value. Anything that is not valid JSON or not a valid container
 * yields `EMPTY_UI_PREFERENCES`; never throws.
 */
export function parseStoredUiPreferences(stored: string): UiPreferences {
  let raw: unknown
  try {
    raw = JSON.parse(stored)
  } catch {
    return EMPTY_UI_PREFERENCES
  }
  const parsed = uiPreferencesSchema.safeParse(raw)
  return parsed.success ? parsed.data : EMPTY_UI_PREFERENCES
}
