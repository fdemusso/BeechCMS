// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { CalendarRange } from "lucide-react"
import type { DateRange as DayPickerRange } from "react-day-picker"
import { isDateRange, type WidgetWindow, type DateRange } from "@beechcms/widget-sdk"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

type Preset = "all" | "week" | "month" | "year" | "thisMonth" | "lastMonth" | "thisYear" | "custom"

const toUnixSeconds = (date: Date) => Math.floor(date.getTime() / 1000)

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

function thisMonthRange(): DateRange {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
  return { from: toUnixSeconds(startOfDay(from)), to: toUnixSeconds(now) }
}

function lastMonthRange(): DateRange {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const to = new Date(now.getFullYear(), now.getMonth(), 0)
  return { from: toUnixSeconds(startOfDay(from)), to: toUnixSeconds(endOfDay(to)) }
}

function thisYearRange(): DateRange {
  const now = new Date()
  const from = new Date(now.getFullYear(), 0, 1)
  return { from: toUnixSeconds(startOfDay(from)), to: toUnixSeconds(now) }
}

/** Resolves the current selection to a preset key, falling back to "custom" for unmatched ranges. */
function resolvePreset(value: WidgetWindow): Preset {
  if (!isDateRange(value)) return value
  const candidates: Record<"thisMonth" | "lastMonth" | "thisYear", DateRange> = {
    thisMonth: thisMonthRange(),
    lastMonth: lastMonthRange(),
    thisYear: thisYearRange(),
  }
  for (const [key, candidate] of Object.entries(candidates)) {
    if (Math.abs(candidate.from - value.from) < 60 && Math.abs(candidate.to - value.to) < 60) {
      return key as Preset
    }
  }
  return "custom"
}

export interface WidgetDateFilterProps {
  value: WidgetWindow
  onChange: (next: WidgetWindow) => void
  className?: string
}

/** Compact popover control letting the operator pin a chart widget to a date reference (preset or custom range). */
export function WidgetDateFilter({ value, onChange, className }: WidgetDateFilterProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<DayPickerRange | undefined>(undefined)
  const activePreset = resolvePreset(value)

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      setPending(isDateRange(value) ? { from: new Date(value.from * 1000), to: new Date(value.to * 1000) } : undefined)
      return
    }
    // Closing: commit a pending custom selection. A single picked day
    // becomes a one-day range; a from/to pair becomes that range.
    if (pending?.from) {
      const from = startOfDay(pending.from)
      const to = pending.to ? endOfDay(pending.to) : endOfDay(pending.from)
      onChange({ from: toUnixSeconds(from), to: toUnixSeconds(to) })
    }
    setPending(undefined)
  }

  const presets: Array<{ key: Preset; window: WidgetWindow }> = [
    { key: "all", window: "all" },
    { key: "week", window: "week" },
    { key: "thisMonth", window: thisMonthRange() },
    { key: "thisYear", window: thisYearRange() },
  ]

  const label = t(`dashboard.widgets.dateFilter.presets.${activePreset}`)

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn("text-muted-foreground", className)}
          title={label}
          aria-label={t("dashboard.widgets.dateFilter.label")}
        >
          <CalendarRange className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" collisionPadding={16} className="w-auto p-2">
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-1">
            {presets.map((preset) => (
              <Button
                key={preset.key}
                variant={activePreset === preset.key ? "secondary" : "ghost"}
                size="sm"
                className="justify-start"
                onClick={() => {
                  onChange(preset.window)
                  setPending(undefined)
                  setOpen(false)
                }}
              >
                {t(`dashboard.widgets.dateFilter.presets.${preset.key}`)}
              </Button>
            ))}
          </div>
          <div className="border-t pt-2">
            <p className="px-1 pb-1 text-xs font-medium text-muted-foreground">
              {t("dashboard.widgets.dateFilter.presets.custom")}
            </p>
            <Calendar
              mode="range"
              selected={pending}
              onSelect={(range) => setPending(range)}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
