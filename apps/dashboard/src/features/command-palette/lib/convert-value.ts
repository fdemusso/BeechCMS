// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

export type ConversionKind = "css" | "storage" | "color" | "unix-seconds" | "unix-millis"

export interface Conversion {
  readonly kind: ConversionKind
  /** The source as recognised, normalised: "16px", "1 GB", "#ff0000", "1700000000". */
  readonly from: string
  /** Copy-ready result: "1rem", "0.9313 GiB", "rgb(255, 0, 0)", "2023-11-14T22:13:20.000Z". */
  readonly to: string
}

/** The px ↔ rem base, shown on the row (brief: "base dichiarata"). */
export const REM_BASE_PX = 16

const MAX_INPUT_LENGTH = 100
const NUMBER = String.raw`(-?(?:\d+(?:\.\d+)?|\.\d+))`
const CONNECTOR = String.raw`(?:\s+(?:to|in)\s+|\s*->\s*)`

const CSS_PATTERN = new RegExp(`^${NUMBER}\\s*(px|rem)(?:${CONNECTOR}(px|rem))?$`, "i")
const STORAGE_PATTERN = new RegExp(`^${NUMBER}\\s+(b|[kmgt]b|[kmgt]ib)(?:${CONNECTOR}(b|[kmgt]b|[kmgt]ib))?$`, "i")
const COLOR_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})(?:\s+to\s+rgb)?$/i
const UNIX_SECONDS_PATTERN = /^\d{10}$/
const UNIX_MILLIS_PATTERN = /^\d{13}$/

interface StorageUnit {
  readonly label: string
  readonly bytes: number
  /** The same magnitude in the other system; absent for the bare byte. */
  readonly counterpart?: string
}

const STORAGE_UNITS: Readonly<Record<string, StorageUnit>> = {
  b: { label: "B", bytes: 1 },
  kb: { label: "KB", bytes: 1000, counterpart: "kib" },
  mb: { label: "MB", bytes: 1000 ** 2, counterpart: "mib" },
  gb: { label: "GB", bytes: 1000 ** 3, counterpart: "gib" },
  tb: { label: "TB", bytes: 1000 ** 4, counterpart: "tib" },
  kib: { label: "KiB", bytes: 1024, counterpart: "kb" },
  mib: { label: "MiB", bytes: 1024 ** 2, counterpart: "mb" },
  gib: { label: "GiB", bytes: 1024 ** 3, counterpart: "gb" },
  tib: { label: "TiB", bytes: 1024 ** 4, counterpart: "tb" },
}

/** At least 1 (or exactly 0): four fraction digits. Below 1: four significant digits. Plain, unlocalised text. */
function formatNumber(value: number): string {
  if (value === 0) return "0"
  const rounded = Math.abs(value) >= 1 ? value.toFixed(4) : value.toPrecision(4)
  return String(Number(rounded))
}

function convertCss(input: string): Conversion | null {
  const match = CSS_PATTERN.exec(input)
  if (!match) return null

  const amount = Number(match[1])
  const source = match[2].toLowerCase()
  const target = match[3]?.toLowerCase() ?? (source === "px" ? "rem" : "px")
  if (target === source) return null

  const result = source === "px" ? amount / REM_BASE_PX : amount * REM_BASE_PX
  return { kind: "css", from: `${formatNumber(amount)}${source}`, to: `${formatNumber(result)}${target}` }
}

function convertStorage(input: string): Conversion | null {
  const match = STORAGE_PATTERN.exec(input)
  if (!match) return null

  const amount = Number(match[1])
  if (amount < 0) return null

  const sourceKey = match[2].toLowerCase()
  const source = STORAGE_UNITS[sourceKey]
  const targetKey = match[3]?.toLowerCase() ?? source.counterpart
  if (!targetKey || targetKey === sourceKey) return null

  const target = STORAGE_UNITS[targetKey]
  const result = (amount * source.bytes) / target.bytes
  return {
    kind: "storage",
    from: `${formatNumber(amount)} ${source.label}`,
    to: `${formatNumber(result)} ${target.label}`,
  }
}

function convertColor(input: string): Conversion | null {
  const match = COLOR_PATTERN.exec(input)
  if (!match) return null

  const digits = match[1].toLowerCase()
  const full = digits.length === 3 ? [...digits].map((digit) => digit + digit).join("") : digits
  const [red, green, blue] = [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16))
  // design-ok: color conversion utility output string, not a styled colour literal
  return { kind: "color", from: `#${digits}`, to: `rgb(${red}, ${green}, ${blue})` }
}

function convertTimestamp(input: string): Conversion | null {
  if (UNIX_SECONDS_PATTERN.test(input)) {
    return { kind: "unix-seconds", from: input, to: new Date(Number(input) * 1000).toISOString() }
  }
  if (UNIX_MILLIS_PATTERN.test(input)) {
    return { kind: "unix-millis", from: input, to: new Date(Number(input)).toISOString() }
  }
  return null
}

/** null when the input is not a recognised conversion. Never throws. */
export function convertValue(input: string): Conversion | null {
  const trimmed = input.trim()
  if (trimmed.length > MAX_INPUT_LENGTH) return null

  return convertCss(trimmed) ?? convertStorage(trimmed) ?? convertColor(trimmed) ?? convertTimestamp(trimmed)
}
