// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { ShortcutKey } from "./shortcut-key"

/** The content of a toolbar tooltip: the action's name and its shortcut as keycaps. */
export const ShortcutTooltip = ({ label, keys }: { readonly label: string; readonly keys: string[] }) => (
  <span className="inline-flex items-center gap-2">
    {label}
    <ShortcutKey keys={keys} />
  </span>
)
