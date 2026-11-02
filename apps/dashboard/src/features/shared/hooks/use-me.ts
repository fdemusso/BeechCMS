// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useQuery } from "@tanstack/react-query"
import type { InferResponseType } from "hono/client"
import { rpc } from "@/lib/rpc"

/** Single cache entry for `GET /api/settings/me`. `features/settings` re-uses this key
 *  through `SETTINGS_QUERY_KEYS.profile()` so the endpoint is fetched exactly once. */
export const ME_QUERY_KEY = ["settings", "profile"] as const

/**
 * Full `GET /api/settings/me` payload, read off the route.
 */
export type MeResponse = InferResponseType<typeof rpc.api.settings.me.$get>

/** What the API sends as a caller's authority: global permissions plus those held per seed slug. */
export type EffectivePermissionsPayload = MeResponse["permissions"]

export function useMe() {
  return useQuery<MeResponse>({
    queryKey: ME_QUERY_KEY,
    queryFn: async () => {
      const response = await rpc.api.settings.me.$get()
      return response.json()
    },
    staleTime: 5 * 60 * 1000,
  })
}
