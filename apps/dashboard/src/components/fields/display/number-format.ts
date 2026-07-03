// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { NumberFieldOptions } from "@beechcms/core"

/**
 * Formats a number for display using the `it-IT` locale, honoring the field's
 * currency/percentage/compact format, decimals, grouping, and optional prefix/suffix.
 *
 * For `percentage` format, values greater than 1 are assumed to already be in "whole
 * percent" form (e.g. 42 meaning 42%) and are divided by 100 before formatting, since
 * `Intl.NumberFormat`'s percent style expects a 0-1 fraction.
 */
export function formatNumber(num: number, options?: NumberFieldOptions): string {
  const intlOpts: Intl.NumberFormatOptions = {}
  
  if (options?.format === "currency") {
    intlOpts.style = "currency"
    intlOpts.currency = options.currency ?? "EUR"
  } else if (options?.format === "percentage") {
    intlOpts.style = "percent"
    if (num > 1) {
      num = num / 100 // Intl.NumberFormat percent expects 0-1 values
    }
  } else if (options?.format === "compact") {
    intlOpts.notation = "compact"
  }

  if (options?.decimals == null) {
    // Default fallback to keep backward compatibility
    intlOpts.maximumFractionDigits = 2
  } else {
    intlOpts.minimumFractionDigits = options.decimals
    intlOpts.maximumFractionDigits = options.decimals
  }

  if (options?.grouping != null) {
    intlOpts.useGrouping = options.grouping
  }

  let formatted = new Intl.NumberFormat("it-IT", intlOpts).format(num)

  // Percent and currency formats handle their own symbols usually, 
  // but if explicit prefix/suffix are provided we append them.
  if (options?.prefix && options.format !== 'currency') {
    formatted = `${options.prefix} ${formatted}`
  }
  if (options?.suffix && options.format !== 'percentage') {
    formatted = `${formatted} ${options.suffix}`
  }

  return formatted.trim()
}
