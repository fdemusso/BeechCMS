import { useQuery } from "@tanstack/react-query"
import axios from "axios"
import type { Seed } from "@beechcms/core"

export function useSchema() {
  return useQuery<Seed[]>({
    queryKey: ["schema"],
    queryFn: async () => {
      const { data } = await axios.get<Seed[]>("/api/schema")
      return data
    },
    staleTime: 1000 * 60 * 5, // 5 minuti
  })
}
