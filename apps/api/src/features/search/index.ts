// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * @module search
 * Public barrel for the search vertical slice.
 *
 * External code (e.g. `factory.ts`) **must** import exclusively from this file.
 * Internal directories (`handlers/`, `constants.ts`, `types.ts`, `search-utils.ts`)
 * are slice-private and must not be imported from outside this feature.
 *
 * Exports:
 * - {@link searchRouter}        – Authenticated FTS Hono sub-app (`/api/search`).
 * - {@link publicSearchRouter}  – Public embedding Hono sub-app (`/api/v1/public/search`).
 * - {@link semanticSearchHooks} – Content lifecycle hooks for vector index maintenance.
 * - {@link semanticSearchJobs}  – Background job registry for vector computation.
 * - {@link compileR2Manifest}   – Utility to manually trigger R2 manifest recompilation.
 */

export { searchRouter }        from './search'
export { publicSearchRouter }  from './public-search.router'
export { semanticSearchHooks } from './jobs/semantic-search.hooks'
export {
  semanticSearchJobs,
  compileR2Manifest,
  type ComputeVectorPayload,
  type UpdateR2ManifestPayload,
} from './jobs/semantic-search.worker'
export type {
  SearchResultItem,
  SearchResponse,
  FtsQueryParams,
  EmbedResponse,
} from './types'
