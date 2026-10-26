// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { Seed, TrashedMode } from '../types.js'

/**
 * Returns the SQL condition (e.g. `ce.deleted_at IS NULL`), or `null` if mode is 'any'.
 *
 * @param seed - The seed schema definition.
 * @param mode - 'active' (default), 'trashed', or 'any'.
 * @param tableAlias - Optional table or alias qualifier prefix.
 */
export function activeCondition(
  seed: Seed,
  mode: TrashedMode = 'active',
  tableAlias?: string,
): string | null {
  if (mode === 'any') return null
  const col = tableAlias ? `${tableAlias}.deleted_at` : 'deleted_at'
  return mode === 'trashed' ? `${col} IS NOT NULL` : `${col} IS NULL`
}

/**
 * Returns ` AND <activeCondition>`, or `''` when mode is 'any'.
 *
 * @param seed - The seed schema definition.
 * @param mode - 'active' (default), 'trashed', or 'any'.
 * @param tableAlias - Optional table or alias qualifier prefix.
 */
export function activeClause(
  seed: Seed,
  mode: TrashedMode = 'active',
  tableAlias?: string,
): string {
  const cond = activeCondition(seed, mode, tableAlias)
  return cond ? ` AND ${cond}` : ''
}
