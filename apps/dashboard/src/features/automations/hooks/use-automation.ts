// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

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
