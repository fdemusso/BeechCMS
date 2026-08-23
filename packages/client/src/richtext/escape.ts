// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

const HTML_ESCAPE_LOOKUP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

const HTML_ESCAPE_REGEX = /[&<>"']/g

/**
 * Escapes special HTML characters in strings to prevent Cross-Site Scripting (XSS).
 */
export function escapeHtml(str: string): string {
  if (!str) return ''
  return str.replace(HTML_ESCAPE_REGEX, (char) => HTML_ESCAPE_LOOKUP[char] || char)
}

/**
 * Strips ASCII control characters (0x00-0x1F, 0x7F-0x9F except \t, \n, \r).
 */
export function stripControlChars(str: string): string {
  if (!str) return ''
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '')
}

const ALLOWED_URL_PROTOCOLS = new Set(['http', 'https', 'mailto', 'tel'])

/**
 * Validates whether a URL is safe to render in href/src attributes.
 * Allows safe protocols (http, https, mailto, tel) and relative paths.
 * Blocks dangerous protocols (javascript:, data:, vbscript:) including obfuscated variants.
 */
export function isSafeUrl(raw: unknown): boolean {
  if (typeof raw !== 'string') return false
  const trimmed = raw.trim()
  if (!trimmed) return false
  const normalized = stripControlChars(trimmed).replace(/\s+/g, '').toLowerCase()
  const schemeMatch = /^([a-z][a-z0-9+.-]*):/.exec(normalized)
  if (!schemeMatch) {
    // Relative URL, path, anchor, or query string
    return true
  }
  return ALLOWED_URL_PROTOCOLS.has(schemeMatch[1])
}
