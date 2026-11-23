// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { rpc } from '@/lib/rpc'
import type {
  AgentIntent,
  AgentIntentApproval,
  AgentIntentDetail,
  AuthorizationRequestMetadata,
  ConsentDecisionBody,
  ConnectedApp,
} from '../types/oauth.types'

/**
 * The authorization server lives at `/oauth/*`, outside `/api`; `rpc` is rooted at '/', so
 * `rpc.oauth.*` reaches it with the bearer injection and the single-flight 401 refresh of `apiFetch`.
 */
export const oauthApi = {
  getAuthorizationRequest: async (params: URLSearchParams): Promise<AuthorizationRequestMetadata> => {
    // The server reads the first value of a repeated key; keep that one when the browser URL repeats it.
    const query: Record<string, string> = {}
    for (const [key, value] of params) {
      if (!Object.hasOwn(query, key)) query[key] = value
    }
    const response = await rpc.oauth.authorize.request.$get({ query })
    return response.json()
  },

  submitConsent: async (body: ConsentDecisionBody): Promise<{ redirectTo: string }> => {
    const response = await rpc.oauth.authorize.consent.$post({ json: body })
    return response.json()
  },

  getConnectedApps: async (): Promise<ConnectedApp[]> => {
    const response = await rpc.oauth.consents.$get()
    return response.json()
  },

  revokeConnectedApp: async (clientId: string): Promise<void> => {
    // `hc` does not encode path params.
    await rpc.oauth.consents[':clientId'].$delete({ param: { clientId: encodeURIComponent(clientId) } })
  },
  listAgentIntents: async (): Promise<AgentIntent[]> => {
    const response = await rpc.api.agent.intents.$get()
    return (await response.json()).intents
  },

  getAgentIntent: async (id: string): Promise<AgentIntentDetail> => {
    const response = await rpc.api.agent.intents[':id'].$get({ param: { id: encodeURIComponent(id) } })
    return (await response.json()).intent
  },

  approveAgentIntent: async (id: string): Promise<AgentIntentApproval> => {
    const response = await rpc.api.agent.intents[':id'].approve.$post({ param: { id: encodeURIComponent(id) } })
    return response.json()
  },

  rejectAgentIntent: async (id: string): Promise<AgentIntent> => {
    const response = await rpc.api.agent.intents[':id'].reject.$post({ param: { id: encodeURIComponent(id) } })
    return (await response.json()).intent
  },
}
