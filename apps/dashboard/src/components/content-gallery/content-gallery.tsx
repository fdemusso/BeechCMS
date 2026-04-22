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
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5">
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
