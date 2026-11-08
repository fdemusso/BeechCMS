// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Loader as Loader2, Monitor as MonitorSmartphone, Trash2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
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
import { SettingsSection } from './settings-section'
import { describeActivity } from '../lib/activity-presentation'

// Rows share one fixed height, so "N rows visible" is exact: the lists below cap at N × this and scroll past it.
// Tailwind only sees whole class names: keep `h-[4.5rem]` below in step with ROW_REM.
const ROW_REM = 4.5
const ROW = 'group/row flex h-[4.5rem] items-center justify-between gap-4 border-b border-border'
const SESSIONS_VISIBLE = 3
const ACTIVITY_VISIBLE = 5

/** Dates follow the language of the dashboard, not a fixed locale. */
function formatDate(ts: number, locale: string): string {
  return new Date(ts * 1000).toLocaleString(locale, {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function SessionRow({ session, onRevoke }: { session: Session; onRevoke: (id: string) => void }) {
  const { t, i18n } = useTranslation()
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
    <div className={ROW}>
      <div className="flex min-w-0 items-center gap-3">
        <MonitorSmartphone className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{t('settings.security.sessionActive')}</p>
          <p className="truncate text-sm text-muted-foreground">
            {t('settings.security.sessionInfo', {
              created: formatDate(session.created_at, i18n.language),
              expires: formatDate(session.expires_at, i18n.language),
            })}
          </p>
        </div>
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          {/* Shown on row hover or keyboard focus; always on touch screens, which cannot hover. */}
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('settings.security.revokeTitle')}
            className={cn(
              'size-8 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover/row:opacity-100 pointer-coarse:opacity-100',
              pending && 'opacity-100'
            )}
          >
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
  const { t, i18n } = useTranslation()
  const view = describeActivity(entry, (key, options) => t(key, options) as string)

  return (
    <div className={ROW}>
      <div className="flex min-w-0 items-center gap-3">
        <Badge variant={view.tone} className="shrink-0">{view.label}</Badge>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{view.title}</p>
          {view.detail && <p className="truncate text-sm text-muted-foreground">{view.detail}</p>}
        </div>
      </div>
      <span className="shrink-0 text-sm text-muted-foreground">{formatDate(entry.created_at, i18n.language)}</span>
    </div>
  )
}

/** Open login sessions, one row each. */
export function SessionsSection() {
  const { t } = useTranslation()
  const { data: sessions, isLoading } = useSessions()
  const revokeSession = useRevokeSession()

  return (
    <SettingsSection id="sessions" title={t('settings.security.sessionsTitle')} description={t('settings.security.sessionsDesc')}>
      {isLoading ? (
        <div className="space-y-3 py-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : !sessions?.length ? (
        <p className="border-b border-border py-4 text-sm text-muted-foreground">{t('settings.security.noSessions')}</p>
      ) : (
        <ScrollArea style={{ maxHeight: `${SESSIONS_VISIBLE * ROW_REM}rem` }}>
          {sessions.map(session => (
            <SessionRow
              key={session.id}
              session={session}
              onRevoke={(id) => revokeSession.mutateAsync(id)}
            />
          ))}
        </ScrollArea>
      )}
    </SettingsSection>
  )
}

/** The latest actions made with this account, one row each. */
export function ActivitySection() {
  const { t } = useTranslation()
  const { data: activity, isLoading } = useSettingsActivity()

  return (
    <SettingsSection id="activity" title={t('settings.security.activityTitle')} description={t('settings.security.activityDesc')}>
      {isLoading ? (
        <div className="space-y-3 py-4">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : !activity?.length ? (
        <p className="border-b border-border py-4 text-sm text-muted-foreground">{t('settings.security.noActivity')}</p>
      ) : (
        <ScrollArea style={{ maxHeight: `${ACTIVITY_VISIBLE * ROW_REM}rem` }}>
          {activity.map(entry => <ActivityRow key={entry.id} entry={entry} />)}
        </ScrollArea>
      )}
    </SettingsSection>
  )
}

/** Sessions and activity, in page order. */
export function SecurityTab() {
  return (
    <>
      <SessionsSection />
      <ActivitySection />
    </>
  )
}
