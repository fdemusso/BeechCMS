// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { rpc } from "@/lib/rpc"
import { registerSeeds, SEED_REGISTRY, type Seed } from "@beechcms/core"

export function useSchema() {
  const query = useQuery<Seed[]>({
    queryKey: ["schema"],
    queryFn: async () => {
      const response = await rpc.api.schema.$get()
      return response.json()
    },
    staleTime: 1000 * 60 * 5,
  })

  // Popola il registro globale di @beechcms/core quando i dati sono pronti
  useEffect(() => {
    if (query.data) {
      registerSeeds(query.data)
      // registerSeeds only adds: a seed deleted since the last fetch must leave the registry too.
      const liveSlugs = new Set(query.data.map((seed) => seed.slug))
      for (const slug of Object.keys(SEED_REGISTRY)) {
        if (!liveSlugs.has(slug)) delete SEED_REGISTRY[slug]
      }
    }
  }, [query.data])

  return query
}

export function useActiveSeed(slug: string | undefined): { seed: Seed | null; isLoading: boolean } {
  const { data: seeds, isLoading } = useSchema()
  if (!slug) return { seed: null, isLoading: false }
  if (isLoading) return { seed: null, isLoading: true }
  return {
    seed: seeds?.find(s => s.slug === slug) ?? null,
    isLoading
  }
}
