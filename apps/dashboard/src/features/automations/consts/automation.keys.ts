// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

export const AUTOMATION_QUERY_KEYS = {
  all: ['automations'] as const,
  lists: () => [...AUTOMATION_QUERY_KEYS.all, 'list'] as const,
  list: (seedSlug: string) => [...AUTOMATION_QUERY_KEYS.lists(), seedSlug] as const,
  items: () => [...AUTOMATION_QUERY_KEYS.all, 'item'] as const,
  item: (id: string) => [...AUTOMATION_QUERY_KEYS.items(), id] as const,
}
