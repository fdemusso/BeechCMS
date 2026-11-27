// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export { buildSearchParams } from './query-builder.js'
export type {
  BeechClientBaseConfig,
  BeechBrowserClientConfig,
  BeechServerClientConfig,
  RequestOptions,
  ListOptions,
  BeechResult,
  BeechProblem,
  BeechFilterOperator,
  FieldFilter,
  ListQuery,
  ListMeta,
  Listable,
  Single,
  BrowserContentResource,
  BeechBrowserClient,
  ServerContentResource,
  BeechServerClient,
  FluentQuery,
  RelationSubquery,
} from './types.js'

export {
  BEECH_SIGNATURE_HEADER,
  DEFAULT_WEBHOOK_TOLERANCE_SECONDS,
  WebhookVerificationError,
  verifyBeechWebhookSignature,
  constructWebhookEvent,
} from './webhooks/index.js'
export type {
  VerifyWebhookSignatureOptions,
  ConstructWebhookEventOptions,
} from './webhooks/index.js'

export { media, mediaSrcSet } from './media/index.js'
export type { MediaFormat, MediaQuality, MediaScalePreset, MediaOptions, MediaUrlOptions } from './media/index.js'
