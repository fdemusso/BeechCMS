// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { automationsApi, type CreateAutomationDto } from '../api/automations.api'
import { AUTOMATION_QUERY_KEYS } from '../consts/automation.keys'

export function useCreateAutomation(seedSlug: string) {
  const queryClient = useQueryClient()
  const { t } = useTranslation()

  return useMutation({
    mutationFn: (body: CreateAutomationDto) => automationsApi.create(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AUTOMATION_QUERY_KEYS.list(seedSlug) })
      toast.success(t('automations.toast.created'))
    },
    onError: () => {
      toast.error(t('automations.toast.error'))
    },
  })
}
