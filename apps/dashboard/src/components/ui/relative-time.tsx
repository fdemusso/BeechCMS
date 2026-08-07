// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

export interface RelativeTimeProps {
  /** Epoch timestamp in seconds or ms (BeechCMS D1 stores created_at/updated_at as unix epoch seconds). */
  value: number | null | undefined
  className?: string
}

const DIVISIONS: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, unit: "second" }, { amount: 60, unit: "minute" },
  { amount: 24, unit: "hour" },   { amount: 7,  unit: "day" },
  { amount: 4.34524, unit: "week" }, { amount: 12, unit: "month" },
  { amount: Number.POSITIVE_INFINITY, unit: "year" },
]

function formatRelative(from: number, locale: string): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" })
  let duration = (from - Date.now()) / 1000
  for (const div of DIVISIONS) {
    if (Math.abs(duration) < div.amount) return rtf.format(Math.round(duration), div.unit)
    duration /= div.amount
  }
  return rtf.format(Math.round(duration), "year")
}

export function RelativeTime({ value, className }: RelativeTimeProps) {
  const { i18n } = useTranslation()
  if (value == null || value === 0) return <span className="text-muted-foreground">—</span>
  // Normalize unix epoch seconds (e.g. 1786137500) to JS Epoch MS
  const epochMs = typeof value === "number" && value < 1e11 ? value * 1000 : value
  const locale = i18n.language || "en"
  const rel = formatRelative(epochMs, locale)
  const abs = new Date(epochMs).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={className}>{rel}</span>
        </TooltipTrigger>
        <TooltipContent side="top">{abs}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
