import type { Seed } from "@beech/core"

import type { ContentEntry } from "@/lib/dynamic-columns"

export interface ContentGalleryProps {
  readonly seed: Seed
  readonly data: ContentEntry[]
  readonly isLoading?: boolean
  readonly onEdit: (entryId: string) => void
}
