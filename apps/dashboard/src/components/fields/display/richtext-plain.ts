// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Checks whether a given value is a TipTap document structure (direct `{ type: "doc" }` or envelope v1 `{ doc: { type: "doc" } }`),
 * or a JSON string encoding one.
 */
export function isTipTapDoc(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed) as unknown
        return isTipTapDoc(parsed)
      } catch {
        return false
      }
    }
    return false
  }
  if (typeof value !== "object" || Array.isArray(value)) return false
  const o = value as Record<string, unknown>
  if (o.type === "doc") return true
  if ("doc" in o && typeof o.doc === "object" && o.doc !== null && (o.doc as Record<string, unknown>).type === "doc") {
    return true
  }
  return false
}

/**
 * Extracts plain text directly from TipTap JSON structure without HTML conversion.
 * This avoids bundling heavy dependencies like KaTeX and highlight.js in table and card views.
 */
export function extractTextFromTiptap(value: unknown): string {
  if (value == null || value === "") return ""

  let doc: unknown = value

  if (typeof doc === "string") {
    const trimmed = doc.trim()
    if (trimmed.startsWith("{")) {
      try {
        doc = JSON.parse(trimmed)
      } catch {
        return ""
      }
    } else {
      return ""
    }
  }

  // Support both direct doc and envelope v1
  if (typeof doc === "object" && doc !== null && !Array.isArray(doc)) {
    if ("doc" in doc) {
      doc = (doc as { doc: unknown }).doc
    }
  }

  if (!doc || typeof doc !== "object" || Array.isArray(doc) || (doc as { type?: unknown }).type !== "doc") {
    return ""
  }

  function traverse(node: unknown, depth = 0): string {
    if (depth > 50 || !node || typeof node !== "object") return ""
    const n = node as { type?: unknown; text?: unknown; content?: unknown }
    if (n.type === "text" && typeof n.text === "string") return n.text
    if (Array.isArray(n.content)) {
      return n.content.map((child) => traverse(child, depth + 1)).join(" ")
    }
    return ""
  }

  return traverse(doc).replace(/\s+/g, " ").trim()
}
