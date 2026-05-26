// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { ImageIcon } from "lucide-react"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { GalleryCard } from "./gallery-components/gallery-card"
import { GalleryPeekPanel } from "./gallery-components/gallery-peek-panel"
import { GallerySkeletonGrid } from "./gallery-components/gallery-skeleton-grid"
import { useContentGallery } from "./gallery-hooks"
import type { ContentGalleryProps } from "./types"

export function ContentGallery({
  seed,
  data,
  isLoading = false,
  onEdit,
}: ContentGalleryProps) {
  const { setPeekId, peekEntry, cardModels } = useContentGallery(seed, data)

  if (isLoading) {
    return <GallerySkeletonGrid />
  }

  if (data.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ImageIcon className="size-5" />
          </EmptyMedia>
          <EmptyTitle>Nessun elemento da visualizzare</EmptyTitle>
          <EmptyDescription>
            Non ci sono contenuti disponibili per questa vista galleria.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <>
      {/* auto-fill: si adatta da 280px min a 420px max per evitare card
          troppo larghe su monitor 21:9 dove 1fr diventerebbe enorme.
          clamp(280px, ...) non è supportato direttamente in grid-template-columns
          quindi usiamo minmax con un cap esplicito. */}
      <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 420px))", justifyContent: "center" }}>
        {cardModels.map((model) => (
          <GalleryCard key={model.entryId} model={model} onOpen={setPeekId} />
        ))}
      </div>

      <GalleryPeekPanel
        seed={seed}
        entry={peekEntry}
        open={peekEntry != null}
        onClose={() => setPeekId(null)}
        onEdit={onEdit}
      />
    </>
  )
}
