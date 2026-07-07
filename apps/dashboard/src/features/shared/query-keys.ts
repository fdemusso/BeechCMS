// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Cross-slice TanStack Query keys.
 *
 * Lives in `features/shared` so no slice has to import from another.
 * The actual invalidation logic stays in the owning slice; this file
 * only owns the key names so producers and consumers agree on them.
 */
export const BACKREF_QUERY_KEY = 'backrefs' as const

export const GLOBAL_DRAFTS_QUERY_KEY = ["global-drafts"] as const

export const DASHBOARD_QUERY_KEYS = {
  all: ["dashboard"] as const,
  stats: () => [...DASHBOARD_QUERY_KEYS.all, "stats"] as const,
  cloudflare: () => [...DASHBOARD_QUERY_KEYS.all, "cloudflare"] as const,
  activity: () => [...DASHBOARD_QUERY_KEYS.all, "activity"] as const,
  health: () => [...DASHBOARD_QUERY_KEYS.all, "health"] as const,
  breakdown: () => [...DASHBOARD_QUERY_KEYS.all, "breakdown"] as const,
  setupChecklist: () => [...DASHBOARD_QUERY_KEYS.all, "setup-checklist"] as const,
  layout: () => [...DASHBOARD_QUERY_KEYS.all, "layout"] as const,
} as const
