// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { RICHTEXT_SCHEMA_VERSION, isRichtextEnvelopeV1 } from '../../content/richtext/richtext.js'
import { stripControlChars, cleanString, isPlainObject, byteLength } from './primitives.js'

/** Allowlisted TipTap node `type` values. Keep in sync with
 *  richtext-render.ts::createRichTextHtmlExtensions. */
const ALLOWED_RICHTEXT_NODE_TYPES = new Set([
  'doc', 'paragraph', 'text', 'heading', 'blockquote', 'bulletList', 'orderedList',
  'listItem', 'codeBlock', 'horizontalRule', 'hardBreak', 'image',
  'table', 'tableRow', 'tableHeader', 'tableCell',
  'inlineMath', 'blockMath', // Mathematics extension
])
/** Allowlisted TipTap mark `type` values. */
const ALLOWED_RICHTEXT_MARK_TYPES = new Set([
  'bold', 'italic', 'strike', 'code', 'link', 'highlight',
  'superscript', 'subscript', 'textStyle',
])
/** Keys that may carry URLs inside a node/mark attrs. */
const URL_LIKE_RICHTEXT_KEYS = new Set(['href', 'src'])
/** Link protocols accepted AFTER normalization. Allowlist, not blocklist. */
const ALLOWED_URL_PROTOCOLS = new Set(['http', 'https', 'mailto', 'tel'])
/** DoS guards, evaluated before the sanitizing walk. */
const RICHTEXT_MAX_DEPTH = 50

/** Result structure of the rich text sanitization function. */
interface RichtextSanitizeResult {
  /** The sanitized string or JSON object. */
  value: unknown
  /** Flag indicating if any dangerous content was detected. */
  dangerous: boolean
  /** Flag indicating if the overall structure is valid rich text. */
  valid: boolean
  /** The size of the sanitized result. */
  size: number
  oversize?: boolean
}

/** State tracks if any dangerous tags or attributes were encountered during traversal. */
interface SanitizeState {
  /** Flag indicating if dangerous elements were found. */
  dangerous: boolean
  depth: number
}

/** RichText string input is no longer accepted (JSON-only). Reject as invalid. */
function sanitizeRichtextString(raw: string): RichtextSanitizeResult {
  return { value: raw, dangerous: false, valid: false, size: byteLength(raw) }
}

/** Normalizes a URL value and confirms its protocol is allowlisted.
 *  Strips ALL whitespace + control chars first, defeating java\tscript: obfuscation. */
function isProtocolAllowed(raw: string): boolean {
  const normalized = stripControlChars(raw).replace(/\s+/g, '').toLowerCase()
  const schemeMatch = /^([a-z][a-z0-9+.-]*):/.exec(normalized)
  if (!schemeMatch) return true // relative URL / anchor / fragment — no protocol
  return ALLOWED_URL_PROTOCOLS.has(schemeMatch[1])
}

/**
 * Recursively walks a rich text node structure, removing (not just flagging) XSS threats
 * and control characters. Returns `undefined` for nodes/attrs that must be dropped entirely.
 *
 * @param node - The node to walk.
 * @param state - The shared sanitization state tracking danger flags.
 * @returns The cleaned rich text node, or `undefined` if it must be removed.
 */
function walkRichtextNode(node: unknown, state: SanitizeState): unknown {
  if (state.depth > RICHTEXT_MAX_DEPTH) {
    state.dangerous = true
    return undefined
  }
  if (typeof node === 'string') return stripControlChars(node)
  if (Array.isArray(node)) {
    state.depth++
    const mapped: unknown[] = []
    for (const child of node) {
      const walked = walkRichtextNode(child, state)
      if (walked !== undefined) mapped.push(walked)
    }
    state.depth--
    return mapped
  }
  if (!isPlainObject(node)) return node

  // Node/mark type allowlist: any present `type` that isn't an allowlisted string is dropped.
  // Objects with no `type` key (e.g. attrs bags) are not nodes and skip this check.
  if ('type' in node) {
    const rawType = node.type
    const isAllowed =
      typeof rawType === 'string' &&
      (ALLOWED_RICHTEXT_NODE_TYPES.has(rawType) || ALLOWED_RICHTEXT_MARK_TYPES.has(rawType))
    if (!isAllowed) {
      state.dangerous = true
      return undefined
    }
  }

  const result: Record<string, unknown> = Object.create(null)
  state.depth++
  for (const [key, entry] of Object.entries(node)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue
    }
    const lower = key.toLowerCase()
    if (lower.startsWith('on')) {
      state.dangerous = true
      continue // drop event-handler attr
    }
    if (
      URL_LIKE_RICHTEXT_KEYS.has(lower) &&
      typeof entry === 'string' &&
      !isProtocolAllowed(entry)
    ) {
      state.dangerous = true
      continue // drop disallowed URL
    }
    const walked = walkRichtextNode(entry, state)
    if (walked !== undefined) result[key] = walked
  }
  state.depth--
  return result
}

/**
 * Sanitizes a rich text JSON document.
 *
 * @param raw - The raw rich text JSON object.
 * @returns The sanitization result.
 */
function sanitizeRichtextJson(raw: Record<string, unknown>): RichtextSanitizeResult {
  const state: SanitizeState = { dangerous: false, depth: 0 }
  const cleaned = walkRichtextNode(raw, state)
  const asObject = isPlainObject(cleaned) ? cleaned : {}
  const valid = asObject.type === 'doc'
  let serialized: string
  try {
    serialized = JSON.stringify(asObject)
  } catch {
    return { value: asObject, dangerous: state.dangerous, valid: false, size: 0 }
  }
  return { value: asObject, dangerous: state.dangerous, valid, size: byteLength(serialized) }
}

/**
 * Main entrance helper to sanitize rich text, handling both v1 envelope formats and raw JSON payloads.
 * String-form input is rejected (JSON-only). Byte size is fail-fast checked before the sanitizing walk.
 *
 * @param raw - The raw rich text input.
 * @param maxBytes - Maximum allowed serialized size, checked before the walk.
 * @returns The sanitization result.
 */
export function sanitizeRichtext(raw: unknown, maxBytes: number): RichtextSanitizeResult {
  const envelopeMode = isRichtextEnvelopeV1(raw)
  const payload = envelopeMode ? (raw as { doc: unknown }).doc : raw

  if (typeof payload === 'string') {
    return sanitizeRichtextString(payload)
  }
  if (!isPlainObject(payload)) {
    return { value: raw, dangerous: false, valid: false, size: 0 }
  }

  // Fail-fast DoS pre-check: size BEFORE the sanitizing walk.
  const rawSize = byteLength(JSON.stringify(payload))
  if (rawSize > maxBytes) {
    return { value: raw, dangerous: false, valid: false, size: rawSize, oversize: true }
  }

  const jsonResult = sanitizeRichtextJson(payload)
  if (!jsonResult.valid) {
    return { value: raw, dangerous: jsonResult.dangerous, valid: false, size: jsonResult.size }
  }
  const finalValue = envelopeMode
    ? { schemaVersion: RICHTEXT_SCHEMA_VERSION, doc: jsonResult.value }
    : jsonResult.value
  // Envelope wrapping changes the serialized bytes; reuse jsonResult.size otherwise.
  const finalSize = envelopeMode ? byteLength(JSON.stringify(finalValue)) : jsonResult.size
  return {
    value: finalValue,
    dangerous: jsonResult.dangerous,
    valid: true,
    size: finalSize,
  }
}

/**
 * Gathers all text and latex strings from a rich text structure to compute if it contains content.
 *
 * @param node - The rich text node to inspect.
 * @param sink - Accumulated text chunks.
 * @param depth - Current recursion depth (guard against pathological structures).
 */
function gatherRichtextText(node: unknown, sink: string[], depth = 0): void {
  if (depth > RICHTEXT_MAX_DEPTH) return
  if (Array.isArray(node)) {
    for (const child of node) gatherRichtextText(child, sink, depth + 1)
    return
  }
  if (!isPlainObject(node)) return
  if (typeof node.text === 'string') {
    sink.push(cleanString(node.text))
  }
  if (isPlainObject(node.attrs) && typeof node.attrs.latex === 'string') {
    sink.push(cleanString(node.attrs.latex))
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) gatherRichtextText(child, sink, depth + 1)
  }
}

/**
 * Checks if a rich text document is effectively empty (contains no text or LaTeX blocks).
 *
 * @param value - The rich text document structure.
 * @returns True if empty, false otherwise.
 */
export function isRichtextDocEmpty(value: unknown): boolean {
  if (!isPlainObject(value)) return false
  if (isRichtextEnvelopeV1(value)) {
    return isRichtextDocEmpty(value.doc)
  }
  if (value.type !== 'doc') return false
  const sink: string[] = []
  gatherRichtextText(value, sink)
  return sink.join('').trim().length === 0
}
