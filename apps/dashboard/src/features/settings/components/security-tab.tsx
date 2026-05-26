// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Loader2, MonitorSmartphone, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useSessions, useRevokeSession, useSettingsActivity } from '../hooks/use-settings'
import type { ActivityEntry, Session } from '../types/settings.types'

const ACTION_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  create: 'default',
  update: 'secondary',
  delete: 'destructive',
  upload: 'outline',
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString('it-IT', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function SessionRow({ session, onRevoke }: { session: Session; onRevoke: (id: string) => void }) {
  const { t } = useTranslation()
  const [pending, setPending] = React.useState(false)

  const handleRevoke = async () => {
    setPending(true)
    try {
      await onRevoke(session.id)
      toast.success(t('settings.security.revokeSuccess'))
    } catch {
      toast.error(t('settings.security.revokeError'))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex items-center justify-between py-3 border-b last:border-0">
      <div className="flex items-center gap-3">
        <MonitorSmartphone className="size-4 text-muted-foreground shrink-0" />
        <div>
          <p className="text-sm font-medium">{t('settings.security.sessionActive')}</p>
          <p className="text-xs text-muted-foreground">
            {t('settings.security.sessionInfo', {
              created: formatDate(session.created_at),
              expires: formatDate(session.expires_at),
            })}
          </p>
        </div>
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.security.revokeTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('settings.security.revokeDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevoke}>{t('settings.security.revokeConfirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const { t } = useTranslation()
  let details: Record<string, unknown> = {}
  try { details = JSON.parse(entry.details ?? '{}') } catch { /* noop */ }
  const title = typeof details.title === 'string' ? details.title : entry.entity_slug ?? entry.entity_type

  return (
    <div className="flex items-center justify-between py-3 border-b last:border-0">
      <div className="flex items-center gap-3">
        <Badge variant={ACTION_VARIANT[entry.action] ?? 'secondary'} className="shrink-0 capitalize">
          {t(`settings.security.actions.${entry.action}`, { defaultValue: entry.action })}
        </Badge>
        <div>
          <p className="text-sm font-medium truncate max-w-xs">{title}</p>
          <p className="text-xs text-muted-foreground">{entry.entity_slug ?? entry.entity_type}</p>
        </div>
      </div>
      <span className="text-xs text-muted-foreground shrink-0 ml-4">{formatDate(entry.created_at)}</span>
    </div>
  )
}

export function SecurityTab() {
  const { t } = useTranslation()
  const { data: sessions, isLoading: sessionsLoading } = useSessions()
  const { data: activity, isLoading: activityLoading } = useSettingsActivity()
  const revokeSession = useRevokeSession()

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.security.sessionsTitle')}</CardTitle>
          <CardDescription>{t('settings.security.sessionsDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {sessionsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !sessions?.length ? (
            <p className="text-sm text-muted-foreground py-4 text-center">{t('settings.security.noSessions')}</p>
          ) : (
            <div>
              {sessions.map(session => (
                <SessionRow
                  key={session.id}
                  session={session}
                  onRevoke={(id) => revokeSession.mutateAsync(id)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.security.activityTitle')}</CardTitle>
          <CardDescription>{t('settings.security.activityDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {activityLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !activity?.length ? (
            <p className="text-sm text-muted-foreground py-4 text-center">{t('settings.security.noActivity')}</p>
          ) : (
            <ScrollArea className="h-72">
              {activity.map(entry => (
                <ActivityRow key={entry.id} entry={entry} />
              ))}
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
