// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import {
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import type { ResolvedPaletteItem } from "../types"

interface PaletteListProps {
  readonly items: readonly ResolvedPaletteItem[]
  /** true while the user is typing: one ranked list, section label on each row. */
  readonly ranked: boolean
  readonly onPerform: (item: ResolvedPaletteItem) => void
}

interface PaletteRowProps {
  readonly item: ResolvedPaletteItem
  readonly showSection: boolean
  readonly onPerform: (item: ResolvedPaletteItem) => void
}

function PaletteRow({ item, showSection, onPerform }: PaletteRowProps) {
  const Icon = item.icon
  const secondLine = item.disabledReason ?? item.description

  return (
    <CommandItem
      value={item.id}
      disabled={item.disabledReason !== null}
      onSelect={() => onPerform(item)}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <div className="flex flex-col">
        <span>{item.label}</span>
        {secondLine && <span className="text-xs text-muted-foreground">{secondLine}</span>}
      </div>
      {showSection && <span className="ml-auto text-xs text-muted-foreground">{item.section}</span>}
      {item.shortcut && (
        <CommandShortcut className="flex items-center gap-0.5">
          {item.shortcut.map((key) => (
            <kbd key={key} className="text-xs font-mono bg-muted text-muted-foreground px-1 rounded">{key}</kbd>
          ))}
        </CommandShortcut>
      )}
    </CommandItem>
  )
}

/** Renders resolved palette rows: grouped by section when idle, one ranked flat list while typing. */
export function PaletteList({ items, ranked, onPerform }: PaletteListProps) {
  if (ranked) {
    return (
      <CommandGroup>
        {items.map((item) => (
          <PaletteRow key={item.id} item={item} showSection onPerform={onPerform} />
        ))}
      </CommandGroup>
    )
  }

  const itemsBySection = new Map<string, ResolvedPaletteItem[]>()
  for (const item of items) {
    const group = itemsBySection.get(item.section) ?? []
    group.push(item)
    itemsBySection.set(item.section, group)
  }

  return (
    <>
      {[...itemsBySection].map(([section, sectionItems], index) => (
        <React.Fragment key={section}>
          {index > 0 && <CommandSeparator />}
          <CommandGroup heading={section}>
            {sectionItems.map((item) => (
              <PaletteRow key={item.id} item={item} showSection={false} onPerform={onPerform} />
            ))}
          </CommandGroup>
        </React.Fragment>
      ))}
    </>
  )
}
