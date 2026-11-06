// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { ViewTypeId } from "@/features/shared"

/**
 * The view types of the content manager, grouped by what they are for. Every type of the catalogue belongs to
 * exactly one group (a test enforces it), so a new view type cannot be added without being placed here.
 */
export const VIEW_GROUPS: readonly { readonly id: string; readonly types: readonly ViewTypeId[] }[] = [
  { id: "browse", types: ["table", "list", "gallery", "feed"] },
  { id: "organize", types: ["kanban", "board", "timeline"] },
  { id: "plan", types: ["calendar", "map"] },
  { id: "insight", types: ["chart", "form"] },
]
