// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { sha256hex, type IIdGenerator, type IOAuthTokenRepository, type OAuthScope } from '@beechcms/core'
import { generateOpaqueToken } from '../../shared/utils/opaque-token'
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS } from './constants'

/**
 * Input arguments for generating and storing an access/refresh token pair.
 */
export interface IssueTokenPairInput {
  /** Repository for persisting OAuth token records. */
  tokenRepository: IOAuthTokenRepository
  /** Service for generating unique UUIDs for token records. */
  idGenerator: IIdGenerator
  /** The client identifier receiving the token pair. */
  clientId: string
  /** The user/resource owner identifier who authorized the grant. */
  userId: string
  /** The granted OAuth scopes bound to these tokens. */
  scope: OAuthScope[]
  /** SHA-256 hash of the root authorization code from which this token family descends. */
  authorizationCodeHash: string
  /** Current Unix epoch timestamp in seconds. */
  nowSeconds: number
}

/**
 * Result of issuing an access/refresh token pair.
 */
export interface IssuedTokenPair {
  /** Plaintext opaque access token returned to the client. */
  accessToken: string
  /** SHA-256 digest of the access token stored in the database. */
  accessTokenHash: string
  /** Plaintext opaque refresh token returned to the client. */
  refreshToken: string
  /** SHA-256 digest of the refresh token stored in the database. */
  refreshTokenHash: string
  /** Access token lifetime in seconds. */
  expiresIn: number
}

/**
 * Generates and persists an access/refresh token pair for an authorized client.
 *
 * Security guarantees:
 * - Plaintext tokens are generated via CSPRNG (`generateOpaqueToken`).
 * - Only SHA-256 hashes (`tokenHash`) reach D1 persistence; plaintext tokens are
 *   never stored in the database.
 * - Both tokens share the same `authorizationCodeHash` to link the token family
 *   for atomic revocation and replay attack mitigation.
 *
 * @param input - The token issuance dependencies and subject parameters.
 * @returns The issued token pair, hashes, and access token expiration.
 */
export async function issueTokenPair(input: IssueTokenPairInput): Promise<IssuedTokenPair> {
  const accessToken = generateOpaqueToken()
  const refreshToken = generateOpaqueToken()
  const accessTokenHash = await sha256hex(accessToken)
  const refreshTokenHash = await sha256hex(refreshToken)

  await input.tokenRepository.save({
    id: input.idGenerator.uuid(),
    tokenHash: accessTokenHash,
    tokenType: 'access',
    clientId: input.clientId,
    userId: input.userId,
    scope: input.scope,
    authorizationCodeHash: input.authorizationCodeHash,
    expiresAt: input.nowSeconds + ACCESS_TOKEN_TTL_SECONDS,
  })

  await input.tokenRepository.save({
    id: input.idGenerator.uuid(),
    tokenHash: refreshTokenHash,
    tokenType: 'refresh',
    clientId: input.clientId,
    userId: input.userId,
    scope: input.scope,
    authorizationCodeHash: input.authorizationCodeHash,
    expiresAt: input.nowSeconds + REFRESH_TOKEN_TTL_SECONDS,
  })

  return { accessToken, accessTokenHash, refreshToken, refreshTokenHash, expiresIn: ACCESS_TOKEN_TTL_SECONDS }
}
