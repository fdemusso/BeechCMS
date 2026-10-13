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
export type TagChipTone = "option" | "obsolete" | "free"

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
