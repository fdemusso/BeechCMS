// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { oauthApi } from '../api/oauth.api'

export const OAUTH_QUERY_KEYS = {
  all: ['oauth'] as const,
  authorizationRequest: (raw: string) => [...OAUTH_QUERY_KEYS.all, 'authorize-request', raw] as const,
  connectedApps: () => [...OAUTH_QUERY_KEYS.all, 'connected-apps'] as const,
}

export function useAuthorizationRequest(params: URLSearchParams) {
  const raw = params.toString()
  return useQuery({
    queryKey: OAUTH_QUERY_KEYS.authorizationRequest(raw),
    queryFn: () => oauthApi.getAuthorizationRequest(params),
    enabled: params.get('client_id') !== null,
    retry: false, // a 400 invalid_client must surface immediately, not after 3 retries
    staleTime: 0, // never reuse a cached authorization request across flows
    gcTime: 0,
  })
}

export function useSubmitConsent() {
  return useMutation({ mutationFn: oauthApi.submitConsent })
}

export function useConnectedApps() {
  return useQuery({
    queryKey: OAUTH_QUERY_KEYS.connectedApps(),
    queryFn: oauthApi.getConnectedApps,
    staleTime: 60 * 1000,
  })
}

export function useRevokeConnectedApp() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: oauthApi.revokeConnectedApp,
    onSuccess: () => qc.invalidateQueries({ queryKey: OAUTH_QUERY_KEYS.connectedApps() }),
  })
}
