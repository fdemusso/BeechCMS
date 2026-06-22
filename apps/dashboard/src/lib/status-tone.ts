// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info"

/** Deterministic, content-agnostic status → tone. Replaces the string-hash Badge variant. */
export function getStatusTone(status: string): StatusTone {
  const s = status.trim().toLowerCase()
  if (!s) return "neutral"
  if (["error", "failed", "rejected", "archived", "lost"].includes(s)) return "danger"
  if (["published", "active", "approved", "online", "won"].includes(s)) return "success"
  if (["draft", "pending", "qualification", "negotiation"].includes(s)) return "warning"
  if (["new", "info", "demo", "proposal"].includes(s)) return "info"
  return "neutral"
}

export const STATUS_TONE_DOT_CLASS: Record<StatusTone, string> = {
  neutral: "bg-muted-foreground/50",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger:  "bg-red-500",
  info:    "bg-sky-500",
}
