// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { Search } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { resolveIcon, ICON_NAMES } from "@/lib/icon-registry"
import { cn } from "@/lib/utils"

export interface IconPickerProps {
  /** Selected icon name; falls back to `fallback` when empty. */
  value: string
  onChange: (iconName: string) => void
  /** Icon shown (and highlighted) while `value` is empty. */
  fallback?: string
  /** Accessible name of the trigger button. */
  ariaLabel: string
  searchPlaceholder: string
  emptyLabel: string
}

const UNIQUE_ICON_NAMES = Array.from(new Set(ICON_NAMES))

/** Icon button that opens a searchable grid of the registered icons. */
export function IconPicker({
  value,
  onChange,
  fallback = "Users",
  ariaLabel,
  searchPlaceholder,
  emptyLabel,
}: IconPickerProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")

  const current = value || fallback
  const SelectedIcon = resolveIcon(current)
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return UNIQUE_ICON_NAMES
    return UNIQUE_ICON_NAMES.filter((name) => name.toLowerCase().includes(q))
  }, [search])

  return (
    <Popover
      modal={true}
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setSearch("")
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-8 shrink-0 rounded-md border-border/80 hover:bg-accent flex items-center justify-center cursor-pointer"
          aria-label={ariaLabel}
          title={ariaLabel}
        >
          <SelectedIcon className="size-4 text-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={4} className="w-64 p-2.5">
        <div className="space-y-2">
          <div className="relative">
            <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs"
              autoFocus
            />
          </div>
          <ScrollArea className="h-48" onWheel={(e) => e.stopPropagation()}>
            <div className="grid grid-cols-6 gap-1 p-0.5 pr-2.5">
              {filtered.map((iconName) => {
                const IconComp = resolveIcon(iconName)
                return (
                  <button
                    key={iconName}
                    type="button"
                    onClick={() => {
                      onChange(iconName)
                      setOpen(false)
                      setSearch("")
                    }}
                    title={iconName}
                    className={cn(
                      "size-8 rounded-md flex items-center justify-center transition-colors cursor-pointer",
                      current === iconName
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "hover:bg-accent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <IconComp className="size-4" />
                  </button>
                )
              })}
              {filtered.length === 0 && (
                <p className="col-span-6 text-center text-xs text-muted-foreground py-4">{emptyLabel}</p>
              )}
            </div>
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  )
}
