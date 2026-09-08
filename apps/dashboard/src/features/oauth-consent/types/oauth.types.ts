// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/** Scope vocabulary mirrored from the authorization server (`@beechcms/core` OAUTH_SCOPES). */
export type OAuthScope = 'schema:read' | 'schema:write'

/** Response of `GET /oauth/authorize/request`. */
export interface AuthorizationRequestMetadata {
  client: { clientId: string; name: string }
  requestedScopes: OAuthScope[]
  newScopes: OAuthScope[]
  consentRequired: boolean
  redirectUri: string
  state: string
}

/** Body of `POST /oauth/authorize/consent` (OAuth params stay snake_case on the wire). */
export interface ConsentDecisionBody {
  response_type: string
  client_id: string
  redirect_uri: string
  scope: string
  state: string
  code_challenge: string
  code_challenge_method: string
  approved: boolean
}

/** One row of `GET /oauth/consents`. */
export interface ConnectedApp {
  clientId: string
  name: string
  scopes: OAuthScope[]
  grantedAt: number
  updatedAt: number
  lastIssuedAt: number | null
  hasActiveTokens: boolean
}
