// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Seed } from "@beechcms/core"

import type { ContentEntry } from "@/lib/dynamic-columns"

export interface ContentGalleryProps {
  readonly seed: Seed
  readonly data: ContentEntry[]
  readonly isLoading?: boolean
  readonly onEdit: (entryId: string) => void
}
