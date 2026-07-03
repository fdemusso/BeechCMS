// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Branch, Seed, DashboardView } from "@beechcms/core"
import type { SeedRecordDTO } from "../api/seeds.api"

export function seedToFormData(record: SeedRecordDTO | null): Record<string, unknown> {
  const d = record?.definition
  return {
    slug: d?.slug ?? "",
    label: d?.label ?? "",
    label_plural: d?.labelPlural ?? "",
    display_name_alias: d?.displayNameAlias ?? "",
    allow_public_read: d?.allowPublicRead ?? false,
    allow_public_post: d?.allowPublicPost ?? false,
    allow_public_edit: d?.allowPublicEdit ?? false,
    allow_drafts: d?.allowDrafts ?? false,
    branches: d?.branches ?? [],
    dash_icon: d?.dashboard?.icon ?? "",
    dash_group: d?.dashboard?.group ?? "",
    dash_order: d?.dashboard?.order ?? undefined,
    dash_hidden: d?.dashboard?.hidden ?? false,
    dash_description: d?.dashboard?.description ?? "",
    dash_view_gallery: (d?.dashboard?.views ?? ['table']).includes('gallery'),
    dash_view_kanban: (d?.dashboard?.views ?? ['table']).includes('kanban'),
  }
}

export function formDataToSeed(f: Record<string, unknown>): Seed {
  // Strip client-only ids from *new* branches (br_new_*) — the server assigns
  // real br_NN ids (sprint 03). Mirrors SeedEditorDialog.buildSeed verbatim.
  const rawBranches = (Array.isArray(f.branches) ? f.branches : []) as Branch[]
  const branches = rawBranches.map((b) => {
    if (!b.id?.startsWith("br_new_")) return b
    const rest: Partial<Branch> = { ...b }
    delete rest.id
    return rest as Branch
  })
  return {
    slug: String(f.slug ?? ""),
    label: String(f.label ?? ""),
    labelPlural: (f.label_plural as string) || undefined,
    displayNameAlias: String(f.display_name_alias ?? ""),
    allowPublicRead: !!f.allow_public_read,
    allowPublicPost: !!f.allow_public_post,
    allowPublicEdit: !!f.allow_public_edit,
    allowDrafts: !!f.allow_drafts,
    branches,
    dashboard: {
      icon: (f.dash_icon as string) || undefined,
      group: (f.dash_group as string) || undefined,
      order: typeof f.dash_order === "number" ? f.dash_order : undefined,
      hidden: !!f.dash_hidden,
      description: (f.dash_description as string) || undefined,
      views: (['table',
        ...(f.dash_view_gallery ? ['gallery'] : []),
        ...(f.dash_view_kanban ? ['kanban'] : []),
      ] as DashboardView[]),
    },
  }
}
