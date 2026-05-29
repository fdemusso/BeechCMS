// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

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
