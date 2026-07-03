// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Public API of the content-gallery slice.
 * Internal domain logic and display sub-components are intentionally hidden.
 */
export { ContentGallery } from "./content-gallery"
export type { ContentGalleryProps } from "./types"

import type { IViewRegistry } from '@/features/shared'
export function registerContentGalleryView(registry: IViewRegistry): void {
  registry.register({ type: 'gallery', labelKey: 'content.list.gallery',
    enabledTools: ['filter', 'sort', 'automation', 'search', 'create'] })
}
