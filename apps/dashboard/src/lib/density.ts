// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

export type TableDensity = "compact" | "normal" | "comfortable"

export const DEFAULT_DENSITY: TableDensity = "normal"

/** Row height in px per density. "normal" MUST stay 48 (== legacy ROW_HEIGHT_PX). */
export const DENSITY_ROW_HEIGHT: Record<TableDensity, number> = {
  compact: 36,
  normal: 48,
  comfortable: 64,
}

/** Tailwind padding utility applied to TableCell per density. */
export const DENSITY_CELL_PADDING: Record<TableDensity, string> = {
  compact: "py-1",
  normal: "py-2",
  comfortable: "py-3",
}
