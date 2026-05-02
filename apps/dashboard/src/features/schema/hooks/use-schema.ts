import { useQuery } from "@tanstack/react-query"
import { api } from "../../../lib/api"
import type { Seed } from "@beechcms/core"

export function useSchema() {
  return useQuery<Seed[]>({
    queryKey: ["schema"],
    queryFn: async () => {
      const { data } = await api.get<Seed[]>("/schema")
      return data
    },
    staleTime: 1000 * 60 * 5, // 5 minuti
  })
}
