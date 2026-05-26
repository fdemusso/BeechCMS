// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Seed } from "@beechcms/core"

import type { ContentEntry } from "@/lib/dynamic-columns"

export function getPeekEntryTitle(seed: Seed, entry: ContentEntry): string {
  const titleBranch = seed.branches.find((branch) => {
    const alias = branch.alias.toLowerCase()
    return alias === "title" || alias === "name"
  })
  if (titleBranch) {
    const value = entry.data[titleBranch.alias]
    if (typeof value === "string" && value.trim().length > 0) return value.trim()
  }
  return entry.slug?.trim() || entry.id
}
