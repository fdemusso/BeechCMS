// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"

export type Status = "published" | "draft" | "scheduled" | "failed" | "archived"

// Full class strings, so Tailwind sees every utility. Neutral has no colour of its own: it is muted.
const TONE = {
  live: { dot: "bg-status-live", badge: "bg-status-live-soft text-status-live-foreground" },
  warning: { dot: "bg-status-warning", badge: "bg-status-warning-soft text-status-warning-foreground" },
  info: { dot: "bg-status-info", badge: "bg-status-info-soft text-status-info-foreground" },
  danger: { dot: "bg-status-danger", badge: "bg-status-danger-soft text-status-danger-foreground" },
  neutral: { dot: "bg-muted-foreground", badge: "bg-muted text-muted-foreground" },
} as const

const STATUS: Record<Status, keyof typeof TONE> = {
  published: "live",
  draft: "warning",
  scheduled: "info",
  failed: "danger",
  archived: "neutral",
}

/** Whether a free-form status string is one of the statuses the badge knows. */
export function isStatus(value: string): value is Status {
  return Object.hasOwn(STATUS, value)
}

interface StatusBadgeProps {
  readonly status: Status
  readonly className?: string
}

/** The only way to show a content or job status (_config/design_system.html#components). */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { t } = useTranslation()
  const tone = TONE[STATUS[status]]

  return (
    <span
      data-slot="status-badge"
      data-status={status}
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center gap-1.5 rounded-full px-2 text-xs font-medium whitespace-nowrap",
        tone.badge,
        className
      )}
    >
      <span aria-hidden className={cn("size-[7px] shrink-0 rounded-full", tone.dot)} />
      {t(`status.${status}`)}
    </span>
  )
}
