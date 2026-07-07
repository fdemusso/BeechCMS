// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

export interface RelativeTimeProps {
  /** Epoch ms (BeechCMS stores created_at/updated_at as number|null). */
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
  if (value == null) return <span className="text-muted-foreground">—</span>
  const locale = i18n.language || "en"
  const rel = formatRelative(value, locale)
  const abs = new Date(value).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })
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
