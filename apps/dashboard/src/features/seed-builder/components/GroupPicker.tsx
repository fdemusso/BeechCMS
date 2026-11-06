// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { Check, Plus, SortV as ChevronsUpDown } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export interface GroupPickerProps {
  /** The group of the content type; empty means the default section. */
  value: string
  /** Groups already used by other content types. */
  groups: readonly string[]
  /** Label of the default section, shown for the empty value. */
  defaultLabel: string
  onChange: (group: string) => void
  id?: string
}

/** Pick one of the existing sidebar groups, the default section, or type a new group name. */
export function GroupPicker({ value, groups, defaultLabel, onChange, id }: GroupPickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")

  const typed = query.trim()
  const known = [defaultLabel, ...groups].some((group) => group.toLowerCase() === typed.toLowerCase())

  function choose(group: string) {
    onChange(group)
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery("")
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>{value || defaultLabel}</span>
          <ChevronsUpDown className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0">
        <Command>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={t("seedBuilder.editor.dashGroupSearch")}
          />
          <CommandList>
            <CommandGroup>
              <CommandItem value={defaultLabel} onSelect={() => choose("")}>
                <span className="truncate">{defaultLabel}</span>
                <span className="text-xs text-muted-foreground">{t("seedBuilder.editor.dashGroupDefault")}</span>
                <Check className={cn("ml-auto size-4 shrink-0", value === "" ? "opacity-100" : "opacity-0")} />
              </CommandItem>
              {groups.map((group) => (
                <CommandItem key={group} value={group} onSelect={() => choose(group)}>
                  <span className="truncate">{group}</span>
                  <Check className={cn("ml-auto size-4 shrink-0", value === group ? "opacity-100" : "opacity-0")} />
                </CommandItem>
              ))}
            </CommandGroup>
            {typed && !known && (
              <CommandGroup>
                <CommandItem forceMount value={`create ${typed}`} onSelect={() => choose(typed)}>
                  <Plus className="size-4" />
                  <span className="truncate">{t("seedBuilder.editor.dashGroupCreate", { name: typed })}</span>
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
