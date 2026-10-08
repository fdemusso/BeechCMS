// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Seed } from "@beechcms/core"
import type { ContentEntry } from "./dynamic-columns"

/** Minimum character length threshold for dynamic cell truncation. */
const MIN_TRUNCATE_LENGTH = 20
/** Maximum character length threshold for dynamic cell truncation to prevent overflow. */
const MAX_TRUNCATE_LENGTH = 60

/**
 * Computes the maximum string content length across a preview page of rows to set truncation thresholds.
 *
 * @param firstPage - List of entries in the first page layout.
 * @param alias - The field alias to check.
 * @returns An integer representing the target truncation length.
 */
function computeMaxStringLength(firstPage: ContentEntry[], alias: string): number {
  let max = 0
  for (const row of firstPage) {
    const cellValue = row.data[alias]
    if (cellValue == null) continue
    const textLength = String(cellValue).length
    if (textLength > max) max = textLength
  }
  return Math.min(
    Math.max(max, MIN_TRUNCATE_LENGTH),
    MAX_TRUNCATE_LENGTH
  )
}

/**
 * Computes maximum string content length for serializable JSON column values.
 *
 * @param firstPage - List of entries in the first page layout.
 * @param alias - The field alias to check.
 * @returns An integer representing the target truncation length, or null if tags.
 */
function computeMaxJsonLength(
  firstPage: ContentEntry[],
  alias: string,
): number | null {
  const isTagsField = alias.toLowerCase().includes("tag")
  if (isTagsField) return null

  let max = 0
  for (const row of firstPage) {
    const cellValue = row.data[alias]
    if (cellValue == null) continue

    let serializedString: string
    if (typeof cellValue === "string") {
      try {
        serializedString = JSON.stringify(JSON.parse(cellValue))
      } catch {
        serializedString = cellValue
      }
    } else {
      serializedString = JSON.stringify(cellValue)
    }

    if (serializedString.length > max) max = serializedString.length
  }

  return Math.min(
    Math.max(max, MIN_TRUNCATE_LENGTH),
    MAX_TRUNCATE_LENGTH
  )
}

/** Fraction digits shown by a number cell without explicit `decimals` (see formatNumber). */
const MAX_NUMBER_DECIMALS = 2

/**
 * Computes the largest number of fraction digits across the page, so a column can show every
 * value with the same decimals.
 *
 * @param firstPage - List of entries in the first page layout.
 * @param alias - The field alias to check.
 * @returns An integer between 0 and {@link MAX_NUMBER_DECIMALS}.
 */
function computeMaxFractionDigits(firstPage: ContentEntry[], alias: string): number {
  let max = 0
  for (const row of firstPage) {
    const cellValue = row.data[alias]
    if (cellValue == null || cellValue === "") continue
    const num = Number(cellValue)
    if (!Number.isFinite(num)) continue
    const text = String(num)
    if (text.includes("e")) continue
    const dot = text.indexOf(".")
    const digits = dot < 0 ? 0 : text.length - dot - 1
    if (digits > max) max = digits
  }
  return Math.min(max, MAX_NUMBER_DECIMALS)
}

/**
 * Dispatches to the appropriate length computation helper based on the branch type.
 *
 * @param branch - The branch seed configuration.
 * @param firstPage - List of entries in the first page layout.
 * @returns Truncation length limit or null.
 */
function computeMaxLengthForBranch(
  branch: Seed["branches"][number],
  firstPage: ContentEntry[],
): number | null {
  if (branch.type === "number") return computeMaxFractionDigits(firstPage, branch.alias)
  if (branch.type === "json") return computeMaxJsonLength(firstPage, branch.alias)
  if (branch.type === "text") return computeMaxStringLength(firstPage, branch.alias)
  return computeMaxStringLength(firstPage, branch.alias)
}

/**
 * Loops over all branches in a schema seed and computes consistent truncation lengths
 * based on values found in the first page of content.
 *
 * @param data - The full list of entries available.
 * @param seed - The schema seed structure.
 * @param rowsPerPage - Pagination limits representing the first page bounds.
 * @returns Dictionary mapping field alias keys to character length thresholds
 *   (for number branches: the fraction digits to display).
 */
export function computeMaxLengths(
  data: ContentEntry[],
  seed: Seed,
  rowsPerPage: number
): Record<string, number> {
  const result: Record<string, number> = {}
  const firstPage = data.slice(0, rowsPerPage)

  for (const branch of seed.branches) {
    const maxLength = computeMaxLengthForBranch(branch, firstPage)
    if (maxLength == null) continue
    result[branch.alias] = maxLength
  }

  return result
}
