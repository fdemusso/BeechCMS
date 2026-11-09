// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { getShortcutKey } from "../utils"

export interface ShortcutKeyProps extends Omit<React.ComponentProps<typeof KbdGroup>, "children"> {
  /** Key names; `mod`, `alt` and `shift` become the symbols of the platform (⌘ ⌥ ⇧ on a Mac, Ctrl Alt ⇧ elsewhere). */
  keys: string[]
}

/** A shortcut as one keycap per key, read aloud as its spoken names ("Control + B"). */
export const ShortcutKey = ({ keys, ...props }: ShortcutKeyProps) => {
  const modifiedKeys = keys.map((key) => getShortcutKey(key))
  const ariaLabel = modifiedKeys.map((shortcut) => shortcut.readable).join(" + ")

  return (
    <KbdGroup aria-label={ariaLabel} {...props}>
      {modifiedKeys.map((shortcut) => (
        <Kbd key={shortcut.symbol} aria-hidden>
          {shortcut.symbol}
        </Kbd>
      ))}
    </KbdGroup>
  )
}

ShortcutKey.displayName = "ShortcutKey"
