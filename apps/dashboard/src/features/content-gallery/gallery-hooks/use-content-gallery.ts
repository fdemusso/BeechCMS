import * as React from "react"
import type { Seed } from "@beechcms/core"

import type { ContentEntry } from "@/lib/dynamic-columns"

import { buildGalleryCardDisplayModel } from "../gallery-card-display"
import type { GalleryCardDisplayModel } from "../gallery-card-display"
import { resolveCardFields } from "../resolve-card-fields"

export interface UseContentGalleryResult {
  peekId: string | null
  setPeekId: React.Dispatch<React.SetStateAction<string | null>>
  peekEntry: ContentEntry | null
  cardModels: GalleryCardDisplayModel[]
}

export function useContentGallery(seed: Seed, data: ContentEntry[]): UseContentGalleryResult {
  const [peekId, setPeekId] = React.useState<string | null>(null)

  const peekEntry = React.useMemo(
    () => data.find((entry) => entry.id === peekId) ?? null,
    [data, peekId]
  )

  React.useEffect(() => {
    if (!peekId) return
    if (data.some((entry) => entry.id === peekId)) return
    setPeekId(null)
  }, [data, peekId])

  const cardFields = React.useMemo(() => resolveCardFields(seed), [seed])

  const cardModels = React.useMemo(
    () => data.map((entry) => buildGalleryCardDisplayModel(entry, cardFields)),
    [data, cardFields]
  )

  return {
    peekId,
    setPeekId,
    peekEntry,
    cardModels,
  }
}
