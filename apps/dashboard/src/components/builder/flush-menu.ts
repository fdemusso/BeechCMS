// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

/**
 * Flush menu: no inner padding and square items, so the window's own rounded corners (it clips its content)
 * are the only rounding, and only the first and last item, the ones touching them, show it.
 */
export const FLUSH_MENU =
  'p-0 [&_[data-slot=dropdown-menu-item]]:rounded-none [&_[data-slot=dropdown-menu-item]]:px-3 [&_[data-slot=dropdown-menu-sub-trigger]]:rounded-none [&_[data-slot=dropdown-menu-sub-trigger]]:px-3 [&_[data-slot=dropdown-menu-separator]]:mx-0 [&_[data-slot=dropdown-menu-separator]]:my-0'
