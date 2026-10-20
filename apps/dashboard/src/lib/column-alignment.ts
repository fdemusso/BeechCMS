// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Branch } from "@beechcms/core"

export type ColumnAlign = "left" | "center" | "right"

/** Flex `justify-*` class that aligns a cell or header wrapper; empty for the default left. */
export const ALIGN_JUSTIFY_CLASS: Record<ColumnAlign, string> = {
  left: "",
  center: "justify-center",
  right: "justify-end",
}

/**
 * Table alignment by data type: numbers right (rating stars are icons, so centered), booleans
 * centered, everything else (text, dates, rich content) left. Headers follow the same value.
 */
export function getBranchAlign(branch: Pick<Branch, "type" | "numberOptions">): ColumnAlign {
  switch (branch.type) {
    case "number":
      return branch.numberOptions?.control === "rating" ? "center" : "right"
    case "boolean":
      return "center"
    default:
      return "left"
  }
}
