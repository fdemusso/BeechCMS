// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from 'react-i18next'
import { Loader as Loader2 } from '@/components/icons'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { SettingsRow, SettingsSection } from '@/components/ui/settings-section'
import { rowDescriptionDomId } from '@/components/ui/settings-section-ids'
import { useNotificationPrefToggle } from '../hooks/use-notification-pref-toggle'
import { NOTIFICATION_PREF_ITEMS } from '../lib/notification-pref-items'

/** Which events notify the person, one switch per row; a change is saved the moment it is made. */
export function NotificationsTab() {
  const { t } = useTranslation()
  const { prefs, isLoading, isSaving: isPending, setPref } = useNotificationPrefToggle()

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
          {NOTIFICATION_PREF_ITEMS.map(({ id, key, fallback, text }) => (
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
                onCheckedChange={(value) => setPref(key, value)}
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
