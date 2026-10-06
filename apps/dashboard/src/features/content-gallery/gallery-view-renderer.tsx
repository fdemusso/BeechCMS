// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import type { ViewDefinition, ViewRendererProps } from "@/features/shared"
import { isImageMediaBranch } from "@beechcms/core"
import { CardConfigDialog } from "@/features/content-kanban"
import { ContentGallery } from "./content-gallery"
import { defaultCardConfig } from "./resolve-card-fields"

/** The Gallery View Type's renderer. Density is not a Gallery concept, so it is absent from `settings`. */
export function GalleryViewRenderer({ seed, query, entries, layout, formatElement, configDialog }: ViewRendererProps) {
  const defaultConfig = React.useMemo(() => defaultCardConfig(seed, layout.groupBy), [seed, layout.groupBy])
  return (
    <>
    <ContentGallery
      seed={seed}
      data={query.data}
      isLoading={query.isLoading}
      onEdit={entries.handleEdit}
      onCreate={entries.handleCreate}
      groupBy={layout.groupBy}
      formatElement={formatElement}
      card={layout.card}
    />
    <CardConfigDialog
      open={configDialog.open}
      onClose={() => configDialog.onOpenChange(false)}
      seed={seed}
      config={layout.card}
      onSave={layout.setCard}
      mediaBranchFilter={isImageMediaBranch}
      defaultConfig={defaultConfig}
    />
    </>
  )
}

export const GALLERY_VIEW_DEFINITION: ViewDefinition = {
  type: "gallery",
  labelKey: "content.list.gallery",
  enabledTools: ["filter", "sort", "automation", "search", "settings", "create", "transfer"],
  settings: ["groupBy", "conditionalFormats", "cardLayout", "pageSize"],
  Renderer: GalleryViewRenderer,
}
