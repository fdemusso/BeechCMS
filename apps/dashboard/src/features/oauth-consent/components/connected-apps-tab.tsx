// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Key, Loader as Loader2, Trash2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  SETTINGS_TABLE_HEAD_REM,
  SETTINGS_TABLE_ROW_CLASS,
  SETTINGS_TABLE_ROW_REM,
  SettingsScroll,
  SettingsSection,
} from '@/components/ui/settings-section'
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
import { useConnectedApps, useRevokeConnectedApp } from '../hooks/use-oauth-consent'
import type { ConnectedApp } from '../types/oauth.types'

// Re-declared locally: the settings slice's formatDate is not shared across
// feature slices (VSA boundary — see the sprint's VETO audit).
function formatDate(ts: number, locale: string): string {
  return new Date(ts * 1000).toLocaleString(locale, {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function AppRow({ app, onRevoke }: { app: ConnectedApp; onRevoke: (clientId: string) => Promise<void> }) {
  const { t, i18n } = useTranslation()
  const [pending, setPending] = React.useState(false)

  const handleRevoke = async () => {
    setPending(true)
    try {
      await onRevoke(app.clientId)
      toast.success(t('oauth.apps.revokeSuccess'))
    } catch {
      toast.error(t('oauth.apps.revokeError'))
    } finally {
      setPending(false)
    }
  }

  const scopes = app.scopes.join(', ')

  return (
    <TableRow className={SETTINGS_TABLE_ROW_CLASS}>
      <TableCell className="max-w-[220px] font-medium">
        <div className="flex items-center gap-2">
          <Key aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{app.name}</span>
        </div>
      </TableCell>
      <TableCell className="max-w-[240px]">
        <span className="block truncate text-muted-foreground" title={scopes}>{scopes}</span>
      </TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground">
        <time dateTime={new Date(app.grantedAt * 1000).toISOString()}>{formatDate(app.grantedAt, i18n.language)}</time>
      </TableCell>
      <TableCell>
        <Badge variant={app.hasActiveTokens ? 'secondary' : 'outline'}>
          {app.hasActiveTokens ? t('oauth.apps.active') : t('oauth.apps.noActiveTokens')}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-destructive"
              aria-label={t('oauth.apps.revokeFor', { client: app.name })}
            >
              {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Trash2 aria-hidden className="size-4" />}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('oauth.apps.revokeTitle')}</AlertDialogTitle>
              <AlertDialogDescription>{t('oauth.apps.revokeDesc', { client: app.name })}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={handleRevoke}>{t('common.confirm')}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </TableRow>
  )
}

/**
 * The applications the person authorized, as a table with its columns named: which application, what it may do,
 * since when, whether it holds a live token, and the button that ends its access. Five rows show before it scrolls.
 */
export function ConnectedAppsTab() {
  const { t } = useTranslation()
  const { data: apps, isLoading } = useConnectedApps()
  const revokeConnectedApp = useRevokeConnectedApp()

  return (
    <SettingsSection id="connected-apps" title={t('oauth.apps.title')} description={t('oauth.apps.description')}>
      {isLoading ? (
        <div role="status" className="space-y-3 py-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          <span className="sr-only">{t('common.loading')}</span>
        </div>
      ) : !apps?.length ? (
        <p className="border-b border-border py-4 text-sm text-muted-foreground">{t('oauth.apps.empty')}</p>
      ) : (
        <SettingsScroll label={t('oauth.apps.listLabel')} rowRem={SETTINGS_TABLE_ROW_REM} headerRem={SETTINGS_TABLE_HEAD_REM}>
          {/* The table must not scroll on its own, or the header could not stay above the rows. */}
          <Table containerClassName="overflow-visible" aria-label={t('oauth.apps.listLabel')}>
            <TableHeader className="sticky top-0 z-10 bg-[var(--settings-page-bg)]">
              <TableRow>
                <TableHead>{t('oauth.apps.application')}</TableHead>
                <TableHead>{t('oauth.apps.permissions')}</TableHead>
                <TableHead>{t('oauth.apps.granted')}</TableHead>
                <TableHead>{t('oauth.apps.status')}</TableHead>
                <TableHead className="text-right">{t('common.actions', 'Actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apps.map((app) => (
                <AppRow
                  key={app.clientId}
                  app={app}
                  onRevoke={(clientId) => revokeConnectedApp.mutateAsync(clientId)}
                />
              ))}
            </TableBody>
          </Table>
        </SettingsScroll>
      )}
    </SettingsSection>
  )
}
