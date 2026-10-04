// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { ViewDefinition, ViewRendererProps } from "@/features/shared"
import { ContentGallery } from "./content-gallery"

/** The Gallery View Type's renderer. Density is not a Gallery concept, so it is absent from `settings`. */
export function GalleryViewRenderer({ seed, query, entries, layout, formatElement }: ViewRendererProps) {
  return (
    <ContentGallery
      seed={seed}
      data={query.data}
      isLoading={query.isLoading}
      onEdit={entries.handleEdit}
      onCreate={entries.handleCreate}
      groupBy={layout.groupBy}
      formatElement={formatElement}
    />
  )
}

export const GALLERY_VIEW_DEFINITION: ViewDefinition = {
  type: "gallery",
  labelKey: "content.list.gallery",
  enabledTools: ["filter", "sort", "automation", "search", "settings", "create", "transfer"],
  settings: ["groupBy", "conditionalFormats", "pageSize"],
  Renderer: GalleryViewRenderer,
}
