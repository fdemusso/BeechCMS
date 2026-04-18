import type { JSONContent } from "@tiptap/core"

function createEmptyDoc(): JSONContent {
  return {
    type: "doc",
    content: [{ type: "paragraph" }],
  }
}

/**
 * Converte valore storage (envelope v1, doc legacy, HTML string) in input `useEditor`.
 */
export function normalizeRichtextValue(value: unknown): JSONContent | string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const o = value as Record<string, unknown>
    if (o.schemaVersion === 1 && o.doc && typeof o.doc === "object") {
      return o.doc as JSONContent
    }
    if (o.type === "doc") {
      return value as JSONContent
    }
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value
  }
  return createEmptyDoc()
}
