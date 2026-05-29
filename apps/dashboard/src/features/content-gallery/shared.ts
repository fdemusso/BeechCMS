// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Funzioni pure e tipi condivisi del modulo content-gallery (analogo a content-toolbar/shared).
 */
export {
  isSeoBranch,
  isTagsBranch,
  partitionGalleryDetailBranches,
  splitMainRichtext,
} from "./gallery-detail-branches"
export { resolveCardFields, type ResolvedCardFields } from "./resolve-card-fields"
export {
  buildGalleryCardDisplayModel,
  getStatusBadgeVariant,
  resolveImageUrl,
  type GalleryCardDisplayModel,
  type StatusBadgeVariant,
} from "./gallery-card-display"
export { getPeekEntryTitle } from "./gallery-peek-title"
