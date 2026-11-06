// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { BRANCH_ALIAS_RE, reservedBranchAliasReason } from "@beechcms/core"
import type { Branch } from "@beechcms/core"
import { slugifyLabel } from "./seed-slug"

/**
 * Derives a field alias (a SQL column name) from its name: snake_case, starting with a letter, never a
 * reserved word, never one already in `taken`. Collisions get `_2`, `_3`, … An unusable name gives "".
 */
export function deriveAlias(name: string, taken: ReadonlySet<string>): string {
  let base = slugifyLabel(name)
  if (!base) return ""
  if (!/^[a-z]/.test(base)) base = `f_${base}`

  const isFree = (alias: string) =>
    BRANCH_ALIAS_RE.test(alias) && !reservedBranchAliasReason(alias) && !taken.has(alias)

  if (isFree(base)) return base
  for (let n = 2; ; n++) {
    const candidate = `${base}_${n}`
    if (isFree(candidate)) return candidate
  }
}

/** Why a field cannot be saved yet, as an i18n key suffix under `seedBuilder.branchEditor.issues`. */
export type BranchIssue = "alias" | "reserved" | "duplicate" | "target"

/** The first reason `branch` is incomplete, or null. `branches` is the whole list, to spot duplicates. */
export function branchIssue(branch: Branch, branches: readonly Branch[]): BranchIssue | null {
  if (!BRANCH_ALIAS_RE.test(branch.alias)) return "alias"
  if (reservedBranchAliasReason(branch.alias)) return "reserved"
  if (branches.some((other) => other !== branch && other.alias === branch.alias)) return "duplicate"
  if (branch.type === "relation" && !branch.targetSeed) return "target"
  return null
}
