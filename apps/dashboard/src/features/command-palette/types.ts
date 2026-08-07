// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type React from "react"

// Tutte le pagine navigabili nella palette
export type CommandPage =
  | "root"
  | "seeds"
  | "create"
  | "search-results"

// Azione singola renderizzata come CommandItem
export interface CommandAction {
  id: string
  label: string
  description?: string
  icon: React.ComponentType<{ className?: string }> // IconComponent compatible
  keywords?: string[]
  shortcut?: string       // lettera singola: "N", "F"
  onSelect: () => void
  disabled?: boolean
}

// Contratto del hook — non esposto come Context React
export interface CommandPaletteState {
  open: boolean
  setOpen: (open: boolean) => void
  pages: CommandPage[]
  currentPage: CommandPage
  pushPage: (page: CommandPage) => void
  popPage: () => void
  search: string
  setSearch: (s: string) => void
}
