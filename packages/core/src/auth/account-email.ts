// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

const ACCOUNT_EMAIL_REGEX = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/
const MAX_ACCOUNT_EMAIL_LENGTH = 254

/** Validates the trimmed, lowercased account identifier used by login and account writes. */
export function isValidAccountEmail(email: string): boolean {
  const normalizedEmail = email.trim().toLowerCase()
  return normalizedEmail.length <= MAX_ACCOUNT_EMAIL_LENGTH && ACCOUNT_EMAIL_REGEX.test(normalizedEmail)
}
