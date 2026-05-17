import type { NumberFieldOptions } from "@beechcms/core"

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

  if (options?.decimals !== undefined) {
    intlOpts.minimumFractionDigits = options.decimals
    intlOpts.maximumFractionDigits = options.decimals
  } else {
    // Default fallback to keep backward compatibility
    intlOpts.maximumFractionDigits = 2
  }

  if (options?.grouping !== undefined) {
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
