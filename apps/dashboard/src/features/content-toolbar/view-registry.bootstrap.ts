// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// Composition root — the ONLY module allowed to import from multiple content slices.

import { viewRegistry } from './view-registry'
import { registerContentGalleryView } from '@/features/content-gallery'
import { registerContentKanbanView } from '@/features/content-kanban'

viewRegistry.register({
  type: 'table',
  labelKey: 'content.list.table',
  enabledTools: ['filter', 'sort', 'automation', 'search', 'settings', 'create'],
})
registerContentGalleryView(viewRegistry)
registerContentKanbanView(viewRegistry)
