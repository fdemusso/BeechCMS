// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Branch } from "@beechcms/core"

/** Drops `options` from a non-`tags` branch: options on any other type are a fatal seed error. Same object when nothing changes. */
export function withoutIneligibleTagOptions(branch: Branch): Branch {
  if (branch.type === "tags" || !("options" in branch)) return branch
  const next: Branch = { ...branch }
  delete next.options
  return next
}
