// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/** Matches standard control characters that should be stripped. */
export const CONTROL_CHARS_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

/**
 * Strips non-printable and dangerous control characters from a string.
 *
 * @param input - The string to clean.
 * @returns The cleaned string.
 */
export function stripControlChars(input: string): string {
  return input.replaceAll(CONTROL_CHARS_REGEX, '')
}

/**
 * Cleans a string by stripping control characters and trimming leading/trailing whitespace.
 *
 * @param input - The string to clean.
 * @returns The cleaned and trimmed string.
 */
export function cleanString(input: string): string {
  return stripControlChars(input).trim()
}

/**
 * Type-guard checking if a value is a plain object (excluding arrays and null).
 *
 * @param input - The value to check.
 * @returns True if the value is a plain object, false otherwise.
 */
export function isPlainObject(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input)
}
