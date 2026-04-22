/**
 * Convenzione storage richtext TipTap nel Content Engine.
 * @see docs/Sprints/tiptap-elevation.md
 */
export const RICHTEXT_SCHEMA_VERSION = 1 as const

export type RichtextEnvelopeV1 = {
  schemaVersion: typeof RICHTEXT_SCHEMA_VERSION
  doc: Record<string, unknown>
}

export function isRichtextEnvelopeV1(value: unknown): value is RichtextEnvelopeV1 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const o = value as Record<string, unknown>
  return o.schemaVersion === RICHTEXT_SCHEMA_VERSION && typeof o.doc === 'object' && o.doc !== null
}
