// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Branch, DataClassification, TagOption } from "@beechcms/core"

/**
 * Starting points for the field list of a new content type. A template fills fields only: it never touches
 * the public-access switches, which stay off until someone turns them on.
 *
 * Personal data is classified field by field: identifiers and contact details are `confidential` (encrypted
 * at rest, never in the public API), the rest of a person's record is `internal` (hidden from the public API).
 */
export type SeedTemplateId = "person" | "event" | "article" | "contact"

export const SEED_TEMPLATE_IDS: readonly SeedTemplateId[] = ["person", "event", "article", "contact"]

interface TemplateField {
  alias: string
  type: Branch["type"]
  required?: boolean
  classification?: Exclude<DataClassification, "public">
  multiple?: boolean
  options?: TagOption[]
  /** File fields only. */
  accept?: "image"
}

interface TemplateDefinition {
  displayNameAlias: string
  /** Sensitive records are never staged as drafts (the API refuses edits to sensitive fields in a draft). */
  allowDrafts: boolean
  fields: TemplateField[]
}

const tags = (...values: [string, string][]): TagOption[] => values.map(([value, color]) => ({ value, color }))

const TEMPLATES: Record<SeedTemplateId, TemplateDefinition> = {
  person: {
    displayNameAlias: "last_name",
    allowDrafts: false,
    fields: [
      { alias: "last_name", type: "text", required: true, classification: "internal" },
      { alias: "first_name", type: "text", required: true, classification: "internal" },
      { alias: "email", type: "text", required: true, classification: "confidential" },
      { alias: "phone", type: "text", classification: "confidential" },
      // Plain storage: an encrypted date does not round-trip through the engine's date serializer.
      { alias: "birth_date", type: "date", classification: "internal" },
      { alias: "tax_id", type: "text", classification: "confidential" },
      { alias: "address", type: "text", classification: "confidential" },
      { alias: "city", type: "text", classification: "internal" },
      { alias: "country", type: "text", classification: "internal" },
      { alias: "photo", type: "file", accept: "image", classification: "internal" },
      {
        alias: "relationship",
        type: "tags",
        multiple: false,
        classification: "internal",
        options: tags(["customer", "#3b82f6"], ["supplier", "#f59e0b"], ["employee", "#10b981"], ["contact", "#64748b"]), // design-ok: option colours are data stored in the seed
      },
      { alias: "marketing_consent", type: "boolean", classification: "internal" },
      { alias: "notes", type: "richtext", classification: "internal" },
    ],
  },
  event: {
    displayNameAlias: "title",
    allowDrafts: true,
    fields: [
      { alias: "title", type: "text", required: true },
      { alias: "description", type: "richtext" },
      { alias: "start_at", type: "date", required: true },
      { alias: "end_at", type: "date", required: true },
      { alias: "all_day", type: "boolean" },
      { alias: "location", type: "text" },
      {
        alias: "event_status",
        type: "tags",
        multiple: false,
        classification: "internal",
        options: tags(["pending", "#f59e0b"], ["confirmed", "#10b981"], ["cancelled", "#ef4444"]), // design-ok: option colours are data stored in the seed
      },
      { alias: "capacity", type: "number", classification: "internal" },
      { alias: "contact_name", type: "text", classification: "internal" },
      { alias: "contact_email", type: "text", classification: "confidential" },
      { alias: "contact_phone", type: "text", classification: "confidential" },
    ],
  },
  article: {
    displayNameAlias: "title",
    allowDrafts: true,
    fields: [
      { alias: "title", type: "text", required: true },
      { alias: "excerpt", type: "text" },
      { alias: "cover", type: "file", accept: "image" },
      { alias: "body", type: "richtext" },
      { alias: "author", type: "text" },
      { alias: "published_at", type: "date" },
      { alias: "categories", type: "tags" },
    ],
  },
  contact: {
    displayNameAlias: "subject",
    allowDrafts: false,
    fields: [
      { alias: "subject", type: "text", required: true, classification: "internal" },
      { alias: "sender", type: "text", required: true, classification: "confidential" },
      { alias: "email", type: "text", required: true, classification: "confidential" },
      { alias: "message", type: "text", required: true, classification: "confidential" },
      {
        alias: "reason",
        type: "tags",
        multiple: false,
        classification: "internal",
        options: tags(["info", "#3b82f6"], ["support", "#f59e0b"], ["partnership", "#8b5cf6"], ["other", "#64748b"]), // design-ok: option colours are data stored in the seed
      },
      {
        alias: "state",
        type: "tags",
        multiple: false,
        classification: "internal",
        options: tags(["new", "#3b82f6"], ["working", "#f59e0b"], ["done", "#10b981"]), // design-ok: option colours are data stored in the seed
      },
    ],
  },
}

export interface BuiltTemplate {
  branches: Branch[]
  displayNameAlias: string
  allowDrafts: boolean
}

/**
 * Builds the fields of a template. `label` receives `(templateId, alias)` and returns the translated field
 * name; ids are client-only (`br_new_`), so the server mints the real ones on save.
 */
export function buildTemplate(
  id: SeedTemplateId,
  label: (templateId: SeedTemplateId, alias: string) => string
): BuiltTemplate {
  const definition = TEMPLATES[id]
  const stamp = Date.now()
  const branches = definition.fields.map((field, index): Branch => {
    const branch: Branch = {
      id: `br_new_${stamp}_${index}`,
      alias: field.alias,
      label: label(id, field.alias),
      type: field.type,
    }
    if (field.required) {
      branch.requiredOnCreate = true
      branch.requiredOnUpdate = true
    }
    if (field.multiple !== undefined) branch.multiple = field.multiple
    if (field.options) branch.options = field.options.map((option) => ({ ...option }))
    if (field.accept) branch.fileOptions = { accept: field.accept }
    if (field.classification) branch.policies = { classification: field.classification }
    return branch
  })
  return { branches, displayNameAlias: definition.displayNameAlias, allowDrafts: definition.allowDrafts }
}
