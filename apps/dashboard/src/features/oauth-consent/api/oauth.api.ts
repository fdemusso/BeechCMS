// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { api } from '@/lib/api'
import type { AuthorizationRequestMetadata, ConsentDecisionBody, ConnectedApp } from '../types/oauth.types'

/**
 * The authorization server lives at `/oauth/*`, outside the `/api` prefix that
 * `api` is configured with. Overriding `baseURL` per request keeps the bearer
 * injection and the single-flight 401 refresh/retry interceptor in `lib/api.ts`,
 * which a bare `axios` call (as used by `/auth/login`) would lose.
 */
const AUTH_SERVER = { baseURL: '/' } as const

export const oauthApi = {
  getAuthorizationRequest: async (params: URLSearchParams): Promise<AuthorizationRequestMetadata> => {
    const { data } = await api.get<AuthorizationRequestMetadata>(
      `/oauth/authorize/request?${params.toString()}`, AUTH_SERVER)
    return data
  },

  submitConsent: async (body: ConsentDecisionBody): Promise<{ redirectTo: string }> => {
    const { data } = await api.post<{ redirectTo: string }>('/oauth/authorize/consent', body, AUTH_SERVER)
    return data
  },

  getConnectedApps: async (): Promise<ConnectedApp[]> => {
    const { data } = await api.get<ConnectedApp[]>('/oauth/consents', AUTH_SERVER)
    return data
  },

  revokeConnectedApp: async (clientId: string): Promise<void> => {
    await api.delete(`/oauth/consents/${encodeURIComponent(clientId)}`, AUTH_SERVER)
  },
}
