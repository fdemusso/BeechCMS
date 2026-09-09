// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { OAuthScope } from './scopes.js'

export interface OAuthClientRecord {
  clientId: string
  name: string
  /** Registered redirect URIs. Loopback entries are matched ignoring the port. */
  redirectUris: string[]
  allowedScopes: OAuthScope[]
  /** True for clients that cannot hold a secret (native/CLI). PKCE is required regardless. */
  isPublic: boolean
  createdAt: number
  disabledAt: number | null
}

export interface IOAuthClientRepository {
  /** Returns the client, or null when unknown or disabled. */
  findActiveById(clientId: string): Promise<OAuthClientRecord | null>
}
