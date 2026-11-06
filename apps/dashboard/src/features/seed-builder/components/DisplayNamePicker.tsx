// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import type { Branch } from "@beechcms/core"
import { Check, SortV as ChevronsUpDown } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { FIELD_TYPE_ICONS } from "../lib/field-types"

export interface DisplayNamePickerProps {
  branches: readonly Branch[]
  /** Alias of the field used as the title of each entry. */
  value: string
  onChange: (alias: string) => void
  /** Id of the trigger, for the label of the surrounding field. */
  id?: string
}

/** The field that names each entry, chosen from a searchable list so a content type with many fields stays easy. */
export function DisplayNamePicker({ branches, value, onChange, id }: DisplayNamePickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)
  const named = branches.filter((b) => b.alias)
  const current = named.find((b) => b.alias === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">
            {current ? current.label || current.alias : t("seedBuilder.editor.displayNameAliasPlaceholder")}
          </span>
          <ChevronsUpDown className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0">
          <Command>
            <CommandInput placeholder={t("seedBuilder.editor.displayNameSearch")} />
            <CommandList>
              <CommandEmpty>{t("seedBuilder.editor.displayNameEmpty")}</CommandEmpty>
              <CommandGroup>
                {named.map((branch) => {
                  const Icon = FIELD_TYPE_ICONS[branch.type]
                  return (
                    <CommandItem
                      key={branch.id}
                      value={`${branch.alias} ${branch.label ?? ""}`}
                      onSelect={() => {
                        onChange(branch.alias)
                        setOpen(false)
                      }}
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{branch.label || branch.alias}</span>
                      <span className="ml-1 truncate font-mono text-xs text-muted-foreground">{branch.alias}</span>
                      <Check className={cn("ml-auto size-4 shrink-0", branch.alias === value ? "opacity-100" : "opacity-0")} />
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
      </PopoverContent>
    </Popover>
  )
}
