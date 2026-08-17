// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export { createBeechClient } from './client.js'
export type { BeechClient, ContentResource, Listable, Single } from './client.js'
export { verifyBeechSignature } from './webhook.js'
export { buildSearchParams } from './query-builder.js'
export type {
  BeechClientConfig, BeechResult, BeechProblem,
  BeechFilterOperator, ListQuery, ListMeta, FieldFilter,
} from './types.js'
