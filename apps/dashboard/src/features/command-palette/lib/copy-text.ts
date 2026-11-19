// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * The legacy copy path: select a hidden textarea and run `execCommand("copy")`. It works where the async clipboard
 * API does not (an insecure origin, or a document that is not focused) and needs no permission.
 * The textarea goes inside the open dialog: Radix traps the focus there and would pull it back from `body`.
 */
function copyWithSelection(value: string): boolean {
  if (typeof document.execCommand !== "function") return false
  const host = document.activeElement?.closest("[role='dialog']") ?? document.body
  const field = document.createElement("textarea")
  field.value = value
  field.setAttribute("readonly", "")
  field.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none"
  host.appendChild(field)
  const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
  try {
    field.select()
    return document.execCommand("copy")
  } catch {
    return false
  } finally {
    field.remove()
    previouslyFocused?.focus()
  }
}

const TOAST_PREVIEW_MAX_LENGTH = 40

/** `value` on one line and cut to a length a toast can hold: a long note must not fill the screen. */
export function toastPreview(value: string): string {
  const oneLine = value.replace(/\s+/g, " ").trim()
  return oneLine.length > TOAST_PREVIEW_MAX_LENGTH ? `${oneLine.slice(0, TOAST_PREVIEW_MAX_LENGTH - 1).trimEnd()}…` : oneLine
}

/** Copies `value` to the clipboard: the async API first, then the selection fallback. Resolves to whether it worked. */
export async function copyText(value: string): Promise<boolean> {
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(value)
      return true
    } catch {
      // Refused (no focus, no permission): the fallback may still succeed.
    }
  }
  return copyWithSelection(value)
}
