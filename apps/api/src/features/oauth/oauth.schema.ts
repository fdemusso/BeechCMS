// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { z } from 'zod'

/**
 * Query of `GET /oauth/authorize/request`. It types the request for `hc` and refuses nothing: the
 * handler reads the same parameters from the URL and answers a missing or unusable one with the
 * OAuth error it has always used (`invalid_client`, `invalid_request`, ...).
 */
export const authorizationRequestQuerySchema = z.object({
  response_type: z.string().optional(),
  client_id: z.string().optional(),
  redirect_uri: z.string().optional(),
  scope: z.string().optional(),
  state: z.string().optional(),
  code_challenge: z.string().optional(),
  code_challenge_method: z.string().optional(),
})

/**
 * Request body sent by the dashboard consent screen when the user submits an authorization decision
 * (OAuth parameters stay snake_case on the wire).
 */
export interface ConsentDecisionBody {
  /** OAuth response_type ('code'). */
  response_type: string
  /** The requesting client identifier. */
  client_id: string
  /** The redirection target URL. */
  redirect_uri: string
  /** Space-separated scope string. */
  scope: string
  /** Client state string. */
  state: string
  /** PKCE code challenge. */
  code_challenge: string
  /** PKCE code challenge method ('S256'). */
  code_challenge_method: string
  /** True if the resource owner approved the grant; false if denied. */
  approved: boolean
}

/**
 * Body of `POST /oauth/authorize/consent`. It types the request for `hc` and refuses nothing: the
 * body is attacker-controlled JSON, so the handler reads every field through a type guard and a
 * wrong-typed one counts as missing. A `null` or non-JSON body is answered by the handler and
 * `rejectMalformedConsentBody`.
 */
export const consentDecisionBodySchema = z.custom<ConsentDecisionBody>()
