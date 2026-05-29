// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import { ArrowUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DatePickerInput } from "@/components/ui/date-picker-input"
import type { FilterGroupType } from "../shared"

interface FilterConditionInputProps {
  readonly type: FilterGroupType
  readonly value: string | number | boolean | null
  readonly onChange: (value: string | number | boolean | null) => void
  readonly selectOptions?: string[]
  readonly availableTags?: string[]
  readonly className?: string
  readonly textClassName?: string
  readonly buttonPlaceholder?: string
}

export function FilterConditionInput({
  type,
  value,
  onChange,
  selectOptions = [],
  availableTags = [],
  className = "h-8 flex-1",
  textClassName = "text-xs",
  buttonPlaceholder,
}: FilterConditionInputProps) {
  const { t } = useTranslation()
  const valuePlaceholder = t("toolbar.conditionInput.value")
  const choosePlaceholder = buttonPlaceholder ?? t("toolbar.conditionInput.choose")

  switch (type) {
    case "number":
      return (
        <Input
          type="number"
          value={typeof value === "number" ? String(value) : ""}
          onChange={(e) => {
            const raw = e.target.value
            onChange(raw.trim() === "" ? null : Number(raw))
          }}
          className={`${className} ${textClassName}`.trim()}
          placeholder={valuePlaceholder}
        />
      )

    case "date": {
      return (
        // dateFormat: uses DEFAULT_DATE_FORMAT until this component moves to features/content-toolbar in Phase B2
        <DatePickerInput
          id="toolbar-filter-date"
          value={value as string | null}
          onChange={onChange}
          placeholder={choosePlaceholder}
        />
      )
    }

    case "boolean": {
      let selectValue = ""
      if (value === true) selectValue = "true"
      else if (value === false) selectValue = "false"
      const handleValueChange = (v: string) => {
        if (v === "true") return onChange(true)
        if (v === "false") return onChange(false)
        return onChange(null)
      }
      return (
        <Select value={selectValue} onValueChange={handleValueChange}>
          <SelectTrigger size="sm" className={`${className} ${textClassName}`.trim()}>
            <SelectValue placeholder={valuePlaceholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">{t("toolbar.conditionInput.true")}</SelectItem>
            <SelectItem value="false">{t("toolbar.conditionInput.false")}</SelectItem>
          </SelectContent>
        </Select>
      )
    }

    case "select":
      return (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={`${className} justify-between ${textClassName}`.trim()}
            >
              <span className="truncate">
                {typeof value === "string" && value ? value : choosePlaceholder}
              </span>
              <ArrowUpDown className="size-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 p-1">
            {selectOptions.map((opt) => (
              <Button
                key={opt}
                type="button"
                variant={value === opt ? "secondary" : "ghost"}
                size="sm"
                className="h-8 w-full justify-start px-2 text-xs"
                onClick={() => onChange(opt)}
              >
                {opt}
              </Button>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )

    case "tags":
      return (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={`${className} justify-between ${textClassName}`.trim()}
            >
              <span className="truncate">
                {typeof value === "string" && value ? value : t("toolbar.conditionInput.tag")}
              </span>
              <ArrowUpDown className="size-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-56 w-56 overflow-y-auto p-1">
            {availableTags.map((tag) => (
              <Button
                key={tag}
                type="button"
                variant={value === tag ? "secondary" : "ghost"}
                size="sm"
                className="h-8 w-full justify-start px-2 text-xs"
                onClick={() => onChange(tag)}
              >
                {tag}
              </Button>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )

    default:
      return (
        <Input
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || null)}
          className={`${className} ${textClassName}`.trim()}
          placeholder={valuePlaceholder}
        />
      )
  }
}
