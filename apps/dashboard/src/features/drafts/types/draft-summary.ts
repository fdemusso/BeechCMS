// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

export interface DraftSummary {
  id: string
  seedSlug: string
  seedLabel: string
  title: string
  updatedAt: number
  lastModifiedBy: { name: string | null; email: string }
}
