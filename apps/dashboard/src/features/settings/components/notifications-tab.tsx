// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { Loader as Loader2 } from 'reicon-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useNotificationPrefs, useUpdateNotificationPrefs } from '../hooks/use-settings'
import type { NotificationPrefs } from '../types/settings.types'

interface PrefItemProps {
  id: string
  label: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled: boolean
}

function PrefItem({ id, label, description, checked, onCheckedChange, disabled }: PrefItemProps) {
  return (
    <div className="flex items-center justify-between py-4">
      <div className="space-y-0.5">
        <Label htmlFor={id} className="text-sm font-medium cursor-pointer">{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  )
}

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

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64 mt-1" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-14 w-full" />)}
        </CardContent>
      </Card>
    )
  }

  const isPending = updatePrefs.isPending

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t('settings.notifications.title')}</CardTitle>
              <CardDescription>{t('settings.notifications.description')}</CardDescription>
            </div>
            {isPending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </div>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            <PrefItem
              id="notif-content-create"
              label={t('settings.notifications.contentCreate.label')}
              description={t('settings.notifications.contentCreate.description')}
              checked={prefs?.contentCreate ?? true}
              onCheckedChange={v => handleChange('contentCreate', v)}
              disabled={isPending}
            />
            <PrefItem
              id="notif-content-update"
              label={t('settings.notifications.contentUpdate.label')}
              description={t('settings.notifications.contentUpdate.description')}
              checked={prefs?.contentUpdate ?? true}
              onCheckedChange={v => handleChange('contentUpdate', v)}
              disabled={isPending}
            />
            <PrefItem
              id="notif-content-delete"
              label={t('settings.notifications.contentDelete.label')}
              description={t('settings.notifications.contentDelete.description')}
              checked={prefs?.contentDelete ?? true}
              onCheckedChange={v => handleChange('contentDelete', v)}
              disabled={isPending}
            />
            <PrefItem
              id="notif-media-upload"
              label={t('settings.notifications.mediaUpload.label')}
              description={t('settings.notifications.mediaUpload.description')}
              checked={prefs?.mediaUpload ?? false}
              onCheckedChange={v => handleChange('mediaUpload', v)}
              disabled={isPending}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
