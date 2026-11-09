// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { Loader as Loader2 } from '@/components/icons'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { SettingsRow, SettingsSection } from '@/components/ui/settings-section'
import { rowDescriptionDomId } from '@/components/ui/settings-section-ids'
import { useNotificationPrefs, useUpdateNotificationPrefs } from '../hooks/use-settings'
import type { NotificationPrefs } from '../types/settings.types'

/** Which events notify the person, one switch per row; a change is saved the moment it is made. */
export function NotificationsTab() {
  const { t } = useTranslation()
  const { data: prefs, isLoading } = useNotificationPrefs()
  const updatePrefs = useUpdateNotificationPrefs()

  const handleChange = async (key: keyof NotificationPrefs, value: boolean) => {
    if (!prefs) return
    const updated: NotificationPrefs = { ...prefs, [key]: value }
    try {
      await updatePrefs.mutateAsync(updated)
      toast.success(t('settings.notifications.saved'))
    } catch {
      toast.error(t('settings.notifications.error'))
    }
  }

  const isPending = updatePrefs.isPending

  const ITEMS = [
    { id: 'notif-content-create', key: 'contentCreate', fallback: true, text: 'contentCreate' },
    { id: 'notif-content-update', key: 'contentUpdate', fallback: true, text: 'contentUpdate' },
    { id: 'notif-content-delete', key: 'contentDelete', fallback: true, text: 'contentDelete' },
    { id: 'notif-media-upload', key: 'mediaUpload', fallback: false, text: 'mediaUpload' },
  ] as const

  return (
    <SettingsSection
      id="notifications"
      title={t('settings.notifications.title')}
      description={t('settings.notifications.description')}
      action={isPending && <Loader2 aria-hidden className="size-4 animate-spin text-muted-foreground" />}
    >
      {isLoading ? (
        <div role="status" className="space-y-4 py-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-14 w-full" />)}
          <span className="sr-only">{t('common.loading')}</span>
        </div>
      ) : (
        <div aria-busy={isPending}>
          {ITEMS.map(({ id, key, fallback, text }) => (
            <SettingsRow
              key={id}
              label={t(`settings.notifications.${text}.label`)}
              htmlFor={id}
              description={t(`settings.notifications.${text}.description`)}
              controlClassName="sm:w-auto"
            >
              <Switch
                id={id}
                checked={prefs?.[key] ?? fallback}
                onCheckedChange={(value) => handleChange(key, value)}
                disabled={isPending}
                aria-describedby={rowDescriptionDomId(id)}
              />
            </SettingsRow>
          ))}
        </div>
      )}
    </SettingsSection>
  )
}
