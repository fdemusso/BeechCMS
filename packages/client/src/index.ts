// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export { createBeechClient } from './client.js'
export type { BeechClient, ContentResource, Listable, Single } from './client.js'
export { buildSearchParams } from './query-builder.js'
export type {
  BeechClientConfig, BeechResult, BeechProblem,
  BeechFilterOperator, ListQuery, ListMeta, FieldFilter,
} from './types.js'

export {
  BEECH_SIGNATURE_HEADER,
  WebhookVerificationError,
  verifyBeechWebhookSignature,
  constructWebhookEvent,
} from './webhooks/index.js'
export type {
  VerifyWebhookSignatureOptions,
  ConstructWebhookEventOptions,
} from './webhooks/index.js'
