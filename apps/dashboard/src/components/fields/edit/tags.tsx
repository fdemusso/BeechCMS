// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { Check, Plus, X } from "reicon-react"
import { isSingleChoiceTags, tagOptionValues } from "@beechcms/core"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { TagChip } from "@/components/ui/tag-chips"
import { extractTagNames, resolveTagChips } from "@/lib/tags-utils"
import { cn } from "@/lib/utils"
import type { FieldEditProps } from "../types"
import { JsonEdit } from "./json"

/**
 * Editor for `tags` branches. With declared options it is a closed choice: a menu with a color dot per option,
 * replacing the value in single-choice mode and adding chips in multiple mode. Without options it falls back to
 * the JSON code editor (free tags). Always emits `string[]`.
 */
export function TagsEdit(props: FieldEditProps) {
  const { branch, value, onChange, disabled, readOnly: propReadOnly } = props
  const { t } = useTranslation()
  const [isMenuOpen, setIsMenuOpen] = React.useState(false)

  if (tagOptionValues(branch).length === 0) return <JsonEdit {...props} />

  const isReadOnly = Boolean(propReadOnly || disabled || (branch as unknown as { readOnly?: boolean }).readOnly)
  const single = isSingleChoiceTags(branch)
  const selected = extractTagNames(value)
  const chips = resolveTagChips(value, branch)
  const allSelected = (branch.options ?? []).every((option) => selected.includes(option.value))

  const removeValue = (removed: string) => {
    if (isReadOnly) return
    onChange(selected.filter((item) => item !== removed))
  }

  const pickOption = (optionValue: string) => {
    const isSelected = selected.includes(optionValue)
    if (single) {
      if (!isSelected) onChange([optionValue])
    } else {
      onChange(isSelected ? selected.filter((item) => item !== optionValue) : [...selected, optionValue])
    }
    if (single || !isSelected) setIsMenuOpen(false)
  }

  return (
    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1.5">
      {chips.length > 0 ? (
        chips.map((chip, index) => (
          <button
            key={`${chip.label}-${index}`}
            type="button"
            disabled={isReadOnly}
            onClick={() => removeValue(chip.label)}
            className="group relative min-w-0 max-w-full disabled:cursor-not-allowed"
            aria-label={t("fields.tags.remove", { value: chip.label })}
            title={chip.label}
          >
            <TagChip chip={chip} className="cursor-pointer select-none transition" />
            {!isReadOnly && (
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-destructive/90 text-white opacity-0 transition-opacity group-hover:opacity-100">
                <X className="size-3.5" />
              </span>
            )}
          </button>
        ))
      ) : (
        <span className="text-xs text-muted-foreground">{t("fields.tags.empty")}</span>
      )}

      {!isReadOnly && (
        <Popover open={isMenuOpen} onOpenChange={setIsMenuOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-6 rounded-full"
              aria-label={t("fields.tags.add")}
            >
              <Plus className="size-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 max-w-full p-2">
            <div className="mb-2 text-xs text-muted-foreground">{t("fields.tags.menuTitle")}</div>
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {(branch.options ?? []).map((option) => {
                const isActive = selected.includes(option.value)
                return (
                  <button
                    key={option.value}
                    type="button"
                    title={option.value}
                    onClick={() => pickOption(option.value)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors",
                      isActive ? "bg-accent/70 text-foreground" : "hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      data-testid="tag-option-dot"
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: option.color }}
                    />
                    <span className="min-w-0 max-w-[180px] flex-1 truncate">{option.value}</span>
                    {isActive ? <Check className="size-4 shrink-0" /> : null}
                  </button>
                )
              })}
              {!single && allSelected ? (
                <p className="px-2 py-1 text-xs text-muted-foreground">{t("fields.tags.allSelected")}</p>
              ) : null}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}
