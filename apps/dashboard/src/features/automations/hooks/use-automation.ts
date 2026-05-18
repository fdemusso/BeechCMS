import { useQuery } from '@tanstack/react-query'
import { automationsApi } from '../api/automations.api'
import { AUTOMATION_QUERY_KEYS } from '../consts/automation.keys'

export function useAutomation(id: string | undefined) {
  return useQuery({
    queryKey: AUTOMATION_QUERY_KEYS.item(id ?? ''),
    queryFn: () => automationsApi.get(id!),
    enabled: Boolean(id),
    staleTime: 10_000,
  })
}
