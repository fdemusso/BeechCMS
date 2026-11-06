// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * System seeds: content types that exist for the platform's own machinery, not for editors.
 *
 * A system seed is a real seed — it has a definition row in `seeds`, a `content_{slug}` table
 * and is read/written through the Botanical Engine like any other. What sets it apart is that
 * a feature of BeechCMS depends on its exact shape (slug, branch aliases), so it must never be
 * presented as something a user can design, edit or delete.
 *
 * ## How a seed becomes a system seed
 *
 * By slug, listed in {@link SYSTEM_SEED_SLUGS}. There is deliberately NO flag on the `Seed`
 * definition and no `seeds` column:
 *  - a flag would need a migration to rewrite the already-shipped definition (and a
 *    `registry_version` bump) to fix a problem that only affects the Content Types admin list;
 *  - `source = 'code'` is not usable as a discriminator — user-authored seeds defined in code
 *    carry it too and must stay manageable;
 *  - `dashboard.hidden` is not usable either — it only hides a seed from the sidebar, and a user
 *    may set it on their own seeds while still wanting to edit them in the builder.
 *
 * ## Contract for adding a system seed
 *
 *  1. Add its slug here (single source of truth — feature code imports the constant, it does not
 *     re-declare the string).
 *  2. Keep `dashboard: { hidden: true }` in its definition so the sidebar skips it.
 *  3. Bootstrap it from a migration (`INSERT OR IGNORE INTO seeds … source 'code'`), as
 *     `0031_import_jobs_seed.sql` does.
 *
 * ## What this does and does not enforce
 *
 * {@link isSystemSeedSlug} is applied in two places:
 *  - `GET /api/seeds` (the seeds admin list) omits system seeds, so no client of the endpoint
 *    sees them;
 *  - the dashboard's Content Types page filters again (defence in depth, and it also keeps them out
 *    of the relation-target candidates).
 *
 * It is NOT the access-control boundary. Edits are refused for another reason: a bootstrapped
 * system seed has `source = 'code'`, and the seeds router answers 409 `seed-manifest-owned` to
 * PUT/DELETE/destructive operations on those (`rejectManifestOwned`). `GET /api/seeds/:slug` still
 * resolves a system seed by slug, and `GET /api/schema` (the runtime registry, which the engine
 * and the import code rely on) still contains it. If more is ever needed, enforce it in the seeds
 * router with this same list rather than introducing a second one.
 */

/** Slug of the seed that records bulk-import jobs (`migrations/0031_import_jobs_seed.sql`). */
export const IMPORT_JOBS_SEED_SLUG = 'import_jobs'

/** Every platform-owned seed slug. Append here; see the module doc for the full contract. */
export const SYSTEM_SEED_SLUGS: readonly string[] = [IMPORT_JOBS_SEED_SLUG]

/** True when `slug` names a platform-owned seed that must not be offered for user management. */
export function isSystemSeedSlug(slug: string): boolean {
  return SYSTEM_SEED_SLUGS.includes(slug)
}
