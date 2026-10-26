// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { Seed } from '../engine/types.js'

/** Global Trash retention when the setting was never configured (feature brief §2). */
export const DEFAULT_TRASH_RETENTION_DAYS = 14

/** Upper bound for any retention value: ~100 years. Keeps `days * 86400` far inside safe-integer range. */
export const MAX_RETENTION_DAYS = 36500

/** True for an integer in [0, MAX_RETENTION_DAYS]. `0` means "never purge". Rejects NaN, floats, strings, null. */
export function isValidRetentionDays(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= 0
    && value <= MAX_RETENTION_DAYS
}

/**
 * Effective retention for one seed: the seed's own `retentionDays` when it is a number (including 0),
 * otherwise `globalRetentionDays`. `0` = never purge. Pure; never throws.
 */
export function resolveRetentionDays(seed: Pick<Seed, 'retentionDays'>, globalRetentionDays: number): number {
  return typeof seed.retentionDays === 'number' ? seed.retentionDays : globalRetentionDays
}
