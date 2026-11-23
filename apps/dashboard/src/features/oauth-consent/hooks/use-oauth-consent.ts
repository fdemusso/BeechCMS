// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { oauthApi } from '../api/oauth.api'

const OAUTH_QUERY_KEYS = {
  all: ['oauth'] as const,
  authorizationRequest: (raw: string) => [...OAUTH_QUERY_KEYS.all, 'authorize-request', raw] as const,
  connectedApps: () => [...OAUTH_QUERY_KEYS.all, 'connected-apps'] as const,
  agentIntents: () => [...OAUTH_QUERY_KEYS.all, 'agent-intents'] as const,
  agentIntent: (id: string) => [...OAUTH_QUERY_KEYS.all, 'agent-intents', id] as const,
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

/** Poll interval of the pending list while the section is on screen. Intents live 10 minutes. */
export const AGENT_INTENTS_REFETCH_MS = 30_000

export function usePendingAgentIntents() {
  return useQuery({
    queryKey: OAUTH_QUERY_KEYS.agentIntents(),
    queryFn: oauthApi.listAgentIntents,
    staleTime: 0,
    refetchInterval: AGENT_INTENTS_REFETCH_MS,
  })
}

export function useAgentIntent(id: string | null) {
  return useQuery({
    queryKey: OAUTH_QUERY_KEYS.agentIntent(id ?? ''),
    queryFn: () => oauthApi.getAgentIntent(id as string),
    enabled: id !== null,
    staleTime: 0,
    retry: false, // a 404 must show at once
  })
}

export function useApproveAgentIntent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => oauthApi.approveAgentIntent(id),
    onSuccess: (approval) => {
      // The replayed request may have changed any domain; the client cannot tell which.
      if (approval.result.status < 400) void qc.invalidateQueries()
    },
    onSettled: () => qc.invalidateQueries({ queryKey: OAUTH_QUERY_KEYS.agentIntents() }),
  })
}

export function useRejectAgentIntent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => oauthApi.rejectAgentIntent(id),
    onSettled: () => qc.invalidateQueries({ queryKey: OAUTH_QUERY_KEYS.agentIntents() }),
  })
}
