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
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { StatusBadge } from "@/components/ui/status-badge"
import type { PaletteRowAction, ResolvedPaletteItem } from "../types"

interface PaletteListProps {
  readonly items: readonly ResolvedPaletteItem[]
  /** true while the user is typing: one ranked list, section label on each row. */
  readonly ranked: boolean
  readonly onPerform: (item: ResolvedPaletteItem) => void
  /** Runs one action picked from a row's right-click menu. */
  readonly onRunAction: (action: PaletteRowAction) => void
}

interface PaletteRowProps {
  readonly item: ResolvedPaletteItem
  readonly showSection: boolean
  readonly onPerform: (item: ResolvedPaletteItem) => void
  readonly onRunAction: (action: PaletteRowAction) => void
}

function PaletteRow({ item, showSection, onPerform, onRunAction }: PaletteRowProps) {
  const Icon = item.icon
  const secondLine = item.disabledReason ?? item.description

  const row = (
    <CommandItem
      // Set again here: the context menu trigger would otherwise replace it with its own slot name.
      data-slot="command-item"
      value={item.id}
      disabled={item.disabledReason !== null}
      // Hides CommandItem's trailing check icon (always its last child): palette rows are never "checked", and its 24px would make the right padding wider than the left.
      className="[&>svg:last-child]:hidden"
      onSelect={() => onPerform(item)}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      {/* flex-1 takes the free space: CommandItem's trailing check icon also has ml-auto and would split it with the section label. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2">
          <span>{item.label}</span>
          {item.status && <StatusBadge status={item.status} />}
        </span>
        {secondLine && <span className="text-xs text-muted-foreground">{secondLine}</span>}
      </div>
      {showSection && <span className="shrink-0 text-right text-xs text-muted-foreground">{item.section}</span>}
      {item.shortcut && (
        <CommandShortcut>
          <KbdGroup>
            {item.shortcut.map((key) => (
              <Kbd key={key}>{key}</Kbd>
            ))}
          </KbdGroup>
        </CommandShortcut>
      )}
    </CommandItem>
  )

  // A disabled row has no actions to offer: its menu would only run what the row itself refuses.
  if (item.disabledReason !== null || !item.actions?.length) return row

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      <ContextMenuContent
        // Radix would hand the focus back to the row; the search field is where typing continues.
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          document.querySelector<HTMLInputElement>("[cmdk-input]")?.focus()
        }}
      >
        {item.actions.map((action) => {
          const ActionIcon = action.icon
          return (
            <ContextMenuItem
              key={action.id}
              variant={action.destructive ? "destructive" : "default"}
              onSelect={() => onRunAction(action)}
            >
              <ActionIcon />
              {action.label}
            </ContextMenuItem>
          )
        })}
      </ContextMenuContent>
    </ContextMenu>
  )
}

/** Renders resolved palette rows: grouped by section when idle, one ranked flat list while typing. */
export function PaletteList({ items, ranked, onPerform, onRunAction }: PaletteListProps) {
  if (ranked) {
    return (
      <CommandGroup>
        {items.map((item) => (
          <PaletteRow key={item.id} item={item} showSection onPerform={onPerform} onRunAction={onRunAction} />
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
              <PaletteRow key={item.id} item={item} showSection={false} onPerform={onPerform} onRunAction={onRunAction} />
            ))}
          </CommandGroup>
        </React.Fragment>
      ))}
    </>
  )
}
