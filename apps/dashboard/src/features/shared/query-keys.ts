/**
 * Cross-slice TanStack Query keys.
 *
 * Lives in `features/shared` so neither `features/dashboard` nor
 * `features/content-management` has to import from the other. The
 * actual invalidation logic still lives in the slice that owns the
 * data; this file only owns the key names so both producers and
 * consumers agree on them.
 */
export const DASHBOARD_QUERY_KEYS = {
  all: ["dashboard"] as const,
  stats: () => [...DASHBOARD_QUERY_KEYS.all, "stats"] as const,
  cloudflare: () => [...DASHBOARD_QUERY_KEYS.all, "cloudflare"] as const,
  activity: () => [...DASHBOARD_QUERY_KEYS.all, "activity"] as const,
  health: () => [...DASHBOARD_QUERY_KEYS.all, "health"] as const,
  breakdown: () => [...DASHBOARD_QUERY_KEYS.all, "breakdown"] as const,
  setupChecklist: () => [...DASHBOARD_QUERY_KEYS.all, "setup-checklist"] as const,
} as const
