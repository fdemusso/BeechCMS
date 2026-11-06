// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/** Whether the app runs on an Apple device, where the shortcut modifier is ⌘ rather than Ctrl. */
export const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)

/** The label of the shortcut modifier key on this platform. */
export const MOD_KEY_LABEL = IS_MAC ? "⌘" : "Ctrl"
