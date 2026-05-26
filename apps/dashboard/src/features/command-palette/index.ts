// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

// Public API of the command-palette feature slice
// DO NOT export internal parts, constants, or _parts/ sub-components
export { CommandPalette } from "./command-palette"
export { useCommandPalette } from "./use-command-palette"
export type { CommandPage, CommandAction, CommandPaletteState } from "./types"
