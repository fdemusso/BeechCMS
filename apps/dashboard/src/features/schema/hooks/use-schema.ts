import { useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "../../../lib/api"
import { registerSeeds, type Seed } from "@beechcms/core"

export function useSchema() {
  const query = useQuery<Seed[]>({
    queryKey: ["schema"],
    queryFn: async () => {
      const { data } = await api.get<Seed[]>("/schema")
      return data
    },
    staleTime: 1000 * 60 * 5, // 5 minuti
  })

  // Popola il registro globale di @beechcms/core quando i dati sono pronti
  useEffect(() => {
    if (query.data) {
      registerSeeds(query.data)
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
