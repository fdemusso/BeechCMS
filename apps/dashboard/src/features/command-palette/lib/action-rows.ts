// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { ResolvedPaletteItem } from "../types"

/** The "actions" page rows for a frozen target: one enabled row per action, in declared order. */
export function toActionRows(target: ResolvedPaletteItem): ResolvedPaletteItem[] {
  return (target.actions ?? []).map((action) => ({
    id: `actions:${action.id}`,
    section: target.label,
    label: action.label,
    icon: action.icon,
    perform: action.perform,
    disabledReason: null,
  }))
}
