// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { NotificationPrefs } from '../types/settings.types'
import { useNotificationPrefs, useUpdateNotificationPrefs } from './use-settings'

export interface NotificationPrefToggle {
  /** undefined until loaded, and after a failed load. */
  readonly prefs: NotificationPrefs | undefined
  readonly isLoading: boolean
  readonly isError: boolean
  /** A save is in flight. */
  readonly isSaving: boolean
  /** The tab's path: merges `key` into the loaded prefs, saves, toasts saved or error. Does nothing before the prefs load. */
  readonly setPref: (key: keyof NotificationPrefs, value: boolean) => Promise<void>
}

/** Notification preferences and their saving path, shared by the Notifications tab and the command palette. `enabled: false` keeps the query idle (default true). */
export function useNotificationPrefToggle(options?: { readonly enabled?: boolean }): NotificationPrefToggle {
  const { t } = useTranslation()
  const { data: prefs, isLoading, isError } = useNotificationPrefs(options)
  const { mutateAsync, isPending: isSaving } = useUpdateNotificationPrefs()

  const setPref = useCallback(
    async (key: keyof NotificationPrefs, value: boolean) => {
      if (!prefs) return
      const updated: NotificationPrefs = { ...prefs, [key]: value }
      try {
        await mutateAsync(updated)
        toast.success(t('settings.notifications.saved'))
      } catch {
        toast.error(t('settings.notifications.error'))
      }
    },
    [prefs, mutateAsync, t],
  )

  return useMemo(
    () => ({ prefs, isLoading, isError, isSaving, setPref }),
    [prefs, isLoading, isError, isSaving, setPref],
  )
}
