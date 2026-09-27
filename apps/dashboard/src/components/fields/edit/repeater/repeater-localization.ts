// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { LOCALIZABLE_BRANCH_TYPES, resolveClassification } from "@beechcms/core"
import type { Branch } from "@beechcms/core"

/** Why a text / richtext / json branch cannot be localized; mirrors seed-validation Fatal 17. */
export type LocalizationBlocker = "sub-field" | "classification"

/** The reason `branch` cannot carry `localized: true`, or `null` when it can (the type check is the caller's). */
export function localizationBlocker(branch: Branch, subField: boolean): LocalizationBlocker | null {
  if (subField) return "sub-field"
  return resolveClassification(branch).storage === "plain" ? null : "classification"
}

/**
 * Drops `localized: true` from a branch that a type or classification change made ineligible, since `PUT /api/seeds`
 * would refuse the whole seed (Fatal 17). Returns `branch` itself when nothing changes.
 */
export function withoutIneligibleLocalized(branch: Branch, subField: boolean): Branch {
  if (branch.localized !== true) return branch
  if (LOCALIZABLE_BRANCH_TYPES.has(branch.type) && localizationBlocker(branch, subField) === null) return branch
  const next: Branch = { ...branch }
  delete next.localized
  return next
}
