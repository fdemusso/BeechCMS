// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

export type PaletteKeyBinding = "secondary-action" | "open-actions"

/**
 * Which palette binding a keydown is. null: not one, cmdk handles it.
 * Mod (Ctrl or Meta) + Enter → "secondary-action"; Shift + Enter → "open-actions".
 */
export function paletteKeyBinding(
  event: Pick<KeyboardEvent, "key" | "shiftKey" | "ctrlKey" | "metaKey" | "altKey" | "isComposing">,
): PaletteKeyBinding | null {
  if (event.key !== "Enter" || event.isComposing) return null
  if (event.ctrlKey || event.metaKey) return "secondary-action"
  if (event.shiftKey) return "open-actions"
  return null
}
