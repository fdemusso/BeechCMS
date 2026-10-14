// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { findTagOption, tagOptionValues, type Branch } from "@beechcms/core"

export function parseTagsValue(value: unknown): unknown {
  if (typeof value !== "string") return value

  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

/** How a tag chip is drawn: a declared option, a value no longer among the options, or a free tag. */
type TagChipTone = "option" | "obsolete" | "free"

export interface TagChipData {
  readonly label: string
  /** Declared option color; present only when `tone === "option"`. */
  readonly color?: string
  readonly tone: TagChipTone
}

/** Stored tag values in order: string items of an array (or JSON-encoded array), verbatim. `[]` for anything else. */
export function extractTagNames(value: unknown): string[] {
  const parsed = parseTagsValue(value)
  if (!Array.isArray(parsed)) return []

  return parsed.filter((item): item is string => typeof item === "string" && item.length > 0)
}

/** One chip per stored value, colored only from the branch options. Never throws. */
export function resolveTagChips(value: unknown, branch: Pick<Branch, "options">): TagChipData[] {
  const hasOptions = tagOptionValues(branch).length > 0

  return extractTagNames(value).map((label): TagChipData => {
    const option = findTagOption(branch, label)
    if (option) return { label, color: option.color, tone: "option" }
    return { label, tone: hasOptions ? "obsolete" : "free" }
  })
}

/** Sort rank of a single-choice tags value: option position, then a value outside the options, then empty last. */
function tagChoiceRank(options: readonly string[], value: string | null): number {
  if (value === null || value === "") return Number.POSITIVE_INFINITY
  const position = options.indexOf(value)
  return position === -1 ? options.length : position
}

/**
 * Orders two single-choice tags values. With options: declared option position, a value outside the options
 * after every option (ties keep their order). Without options: `localeCompare(…, "it")`. `null` (empty) is last.
 */
export function compareTagChoice(branch: Pick<Branch, "options">, a: string | null, b: string | null): number {
  const options = tagOptionValues(branch)
  const emptyA = a === null || a === ""
  const emptyB = b === null || b === ""
  if (emptyA || emptyB) return Number(emptyA) - Number(emptyB)
  if (options.length === 0) return a.localeCompare(b, "it")

  const rankA = tagChoiceRank(options, a)
  const rankB = tagChoiceRank(options, b)
  return rankA === rankB ? 0 : rankA - rankB
}

/** Filter values for a `tags` column: option values in declared order when the branch has options, else `observed` deduplicated and sorted ("it"). */
export function tagFilterValues(branch: Pick<Branch, "options">, observed: readonly string[]): string[] {
  const options = tagOptionValues(branch)
  if (options.length > 0) return options

  return [...new Set(observed)].sort((a, b) => a.localeCompare(b, "it"))
}
