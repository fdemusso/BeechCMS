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
 * Type-guard checking if a value is a plain object (excluding arrays, null, and class instances).
 * Accepts only objects whose prototype is `Object.prototype` or `null` (created via `Object.create(null)`).
 *
 * @param input - The value to check.
 * @returns True if the value is a plain object, false otherwise.
 */
export function isPlainObject(input: unknown): input is Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return false
  const proto = Object.getPrototypeOf(input) as unknown
  return proto === Object.prototype || proto === null
}

const byteLengthEncoder = new TextEncoder()

/**
 * Measures the real UTF-8 byte length of a string, not UTF-16 code units.
 * `.length` undercounts multi-byte chars (CJK, emoji) by up to 4x, which matters
 * for size limits meant to bound storage (D1/SQLite is byte-addressed).
 *
 * @param input - The string to measure.
 * @returns The UTF-8 byte length.
 */
export function byteLength(input: string): number {
  return byteLengthEncoder.encode(input).length
}

const byteLengthEncoder = new TextEncoder()

/**
 * Measures the real UTF-8 byte length of a string, not UTF-16 code units.
 * `.length` undercounts multi-byte chars (CJK, emoji) by up to 4x, which matters
 * for size limits meant to bound storage (D1/SQLite is byte-addressed).
 *
 * @param input - The string to measure.
 * @returns The UTF-8 byte length.
 */
export function byteLength(input: string): number {
  return byteLengthEncoder.encode(input).length
}
