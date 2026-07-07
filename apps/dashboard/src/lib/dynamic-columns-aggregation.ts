// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { AggregationFn } from "@tanstack/react-table"
import { normalizeDateToYmd } from "@/lib/filter-dsl"
import type { ContentEntry } from "./dynamic-columns"

/**
 * Granularity precision levels for grouping table rows by dates.
 * - `year` and `month` can be combined (e.g. "January 2024").
 * - `day` is exclusive: if day is true, month/year are ignored.
 */
export interface DateGroupPrecision {
  /** Groups by calendar year. */
  year: boolean
  /** Groups by calendar month. */
  month: boolean
  /** Exclusive: Groups by exact calendar day. */
  day: boolean
}

/** Default date grouping configuration precision. */
export const DEFAULT_DATE_GROUP_PRECISION: DateGroupPrecision = {
  year: true,
  month: true,
  day: false,
}

/**
 * Converts a raw date value into a formatted grouping key based on precision.
 *
 * @param value - The raw date value (ISO string or epoch).
 * @param precision - Precision grouping rules.
 * @returns A string suitable for grouping headers.
 */
export function getDateGroupValue(
  value: unknown,
  precision: DateGroupPrecision = DEFAULT_DATE_GROUP_PRECISION
): string {
  const normalizedYmd = normalizeDateToYmd(value)
  if (!normalizedYmd) return "—"
  // Force UTC midnight to avoid timezone drift
  const date = new Date(normalizedYmd + "T00:00:00")

  if (precision.day) {
    return date.toLocaleDateString("en-US", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    })
  }

  const parts: string[] = []
  if (precision.month) {
    parts.push(date.toLocaleDateString("en-US", { month: "long" }))
  }
  if (precision.year) {
    parts.push(String(date.getFullYear()))
  }
  return parts.length ? parts.join(" ") : String(date.getFullYear())
}

/**
 * Custom aggregation function for boolean columns.
 * Tallies total true and false results within grouped subrows.
 */
export const booleanAggFn: AggregationFn<ContentEntry> = (columnId, leafRows) => {
  let trueCount = 0
  let falseCount = 0
  for (const row of leafRows) {
    const cellValue = row.getValue(columnId)
    if (cellValue === true) {
      trueCount++
    } else if (cellValue === false) {
      falseCount++
    }
  }
  return { trueCount, falseCount }
}

/**
 * Formats aggregated boolean values count as Check/Cross indicator strings.
 *
 * @param value - The aggregated value object containing counts.
 * @returns A formatted string or empty.
 */
export function formatBooleanAggregated(value: unknown): string {
  if (
    value != null &&
    typeof value === "object" &&
    "trueCount" in value &&
    "falseCount" in value
  ) {
    const { trueCount, falseCount } = value as { trueCount: number; falseCount: number }
    return `✓ ${trueCount} / ✗ ${falseCount}`
  }
  return ""
}

/**
 * Formats numeric sums for aggregated column groups.
 *
 * @param value - The aggregated numerical value sum.
 * @param count - The total count of leaf rows in the group.
 * @param translate - Localization translate callback function.
 * @returns A localized string summarizing the aggregation.
 */
export function formatSum(
  value: unknown,
  count: number,
  translate: (key: string, options?: any) => string
): string {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return `Σ ${value.toLocaleString("en-US")} · ${count} ${
      count === 1 ? translate("content.table.item") : translate("content.table.items")
    }`
  }
  return `${count} ${count === 1 ? translate("content.table.item") : translate("content.table.items")}`
}
