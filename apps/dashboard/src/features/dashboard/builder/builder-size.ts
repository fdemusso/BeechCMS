// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

/**
 * What the builder adds around its column grid, in px: the pane's `px-6` (2 x 24), the section's border (2 x 1)
 * and the section's `px-3` (2 x 12). With the dialog this much wider than the dashboard's content, a column
 * in the builder is as wide as the same column on the dashboard, so a ghost has the shape of the card it stands
 * for. Update it when that padding changes.
 */
export const BUILDER_CHROME_PX = 74

/** Narrowest the dialog gets, so a small dashboard still leaves room for the header and the footer. */
const MIN_WIDTH_PX = 720

/**
 * The dialog's CSS width. `referenceWidth` is the width of the dashboard's content area as it is on screen right
 * now. The dialog is that plus the builder's own padding, never wider than the window, and never narrower than
 * `MIN_WIDTH_PX` unless the window is. Without a measurement it falls back to 80% of the window.
 */
export function builderDialogWidth(referenceWidth: number | undefined): string {
  if (!referenceWidth || referenceWidth <= 0) return '80vw'
  return `min(96vw, max(${MIN_WIDTH_PX}px, ${Math.round(referenceWidth) + BUILDER_CHROME_PX}px))`
}
