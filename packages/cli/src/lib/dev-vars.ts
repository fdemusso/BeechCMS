// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

const KEY_LINE = /^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/

function unquote(value: string): string {
  const first = value[0]
  if (value.length >= 2 && (first === '"' || first === "'") && value.endsWith(first)) return value.slice(1, -1)
  return value
}

/** Parses `.dev.vars` (dotenv subset): `KEY=value` lines; blank lines and `#` comments are ignored. */
export function parseDevVars(content: string): Record<string, string> {
  const entries: Record<string, string> = {}
  for (const line of content.split(/\r?\n/)) {
    const match = KEY_LINE.exec(line)
    if (match) entries[match[1]] = unquote(match[2].trim())
  }
  return entries
}

/**
 * Sets each entry in `.dev.vars` content: an existing `KEY=` line keeps its position and gets the new value,
 * a missing key is appended at the end. Every other line is kept byte for byte.
 */
export function upsertDevVars(content: string, entries: Record<string, string>): string {
  const eol = content.includes('\r\n') ? '\r\n' : '\n'
  const lines = content === '' ? [] : content.split(/\r?\n/)
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()

  const missing: string[] = []
  for (const [key, value] of Object.entries(entries)) {
    const index = lines.findIndex((line) => KEY_LINE.exec(line)?.[1] === key)
    if (index === -1) missing.push(`${key}=${value}`)
    else lines[index] = `${key}=${value}`
  }

  if (missing.length > 0) {
    if (lines.length > 0) lines.push('')
    lines.push(...missing)
  }
  return lines.length === 0 ? '' : lines.join(eol) + eol
}
