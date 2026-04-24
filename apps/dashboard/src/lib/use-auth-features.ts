import { useQuery } from '@tanstack/react-query'
import axios from 'axios'

interface AuthFeatures {
  passwordReset: boolean
}

async function fetchAuthFeatures(): Promise<AuthFeatures> {
  const { data } = await axios.get<AuthFeatures>('/auth/features')
  return data
}

export function useAuthFeatures() {
  const { data } = useQuery({
    queryKey: ['auth-features'],
    queryFn: fetchAuthFeatures,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  return { passwordReset: data?.passwordReset ?? false }
}
