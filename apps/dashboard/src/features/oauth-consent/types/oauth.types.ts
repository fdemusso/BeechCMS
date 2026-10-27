// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { InferRequestType, InferResponseType } from 'hono/client'
import type { rpc } from '@/lib/rpc'

/** Response of `GET /oauth/authorize/request`. */
export type AuthorizationRequestMetadata = InferResponseType<typeof rpc.oauth.authorize.request.$get>

/** Scope vocabulary of the authorization server (`@beechcms/core` OAUTH_SCOPES). */
export type OAuthScope = AuthorizationRequestMetadata['requestedScopes'][number]

/** Body of `POST /oauth/authorize/consent` (OAuth params stay snake_case on the wire). */
export type ConsentDecisionBody = InferRequestType<typeof rpc.oauth.authorize.consent.$post>['json']

/** One row of `GET /oauth/consents`. */
export type ConnectedApp = InferResponseType<typeof rpc.oauth.consents.$get>[number]
