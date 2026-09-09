// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Key, Loader as Loader2, Trash2 } from 'reicon-react'
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
import { useConnectedApps, useRevokeConnectedApp } from '../hooks/use-oauth-consent'
import type { ConnectedApp } from '../types/oauth.types'

// Re-declared locally: the settings slice's formatDate is not shared across
// feature slices (VSA boundary — see the sprint's VETO audit).
function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString('it-IT', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function AppRow({ app, onRevoke }: { app: ConnectedApp; onRevoke: (clientId: string) => Promise<void> }) {
  const { t } = useTranslation()
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

  return (
    <div className="flex items-center justify-between py-3 border-b last:border-0">
      <div className="flex items-center gap-3">
        <Key className="size-4 text-muted-foreground shrink-0" />
        <div>
          <p className="text-sm font-medium">{app.name}</p>
          <p className="text-xs text-muted-foreground">
            {t('oauth.apps.grantedAt', { date: formatDate(app.grantedAt) })}
          </p>
          <div className="flex items-center gap-1.5 mt-1">
            {app.scopes.map((scope) => (
              <Badge key={scope} variant="secondary" className="text-[10px]">{scope}</Badge>
            ))}
            {!app.hasActiveTokens && (
              <Badge variant="outline" className="text-[10px]">{t('oauth.apps.noActiveTokens')}</Badge>
            )}
          </div>
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
            <AlertDialogTitle>{t('oauth.apps.revokeTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('oauth.apps.revokeDesc', { client: app.name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevoke}>{t('common.confirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export function ConnectedAppsTab() {
  const { t } = useTranslation()
  const { data: apps, isLoading } = useConnectedApps()
  const revokeConnectedApp = useRevokeConnectedApp()

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('oauth.apps.title')}</CardTitle>
        <CardDescription>{t('oauth.apps.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : !apps?.length ? (
          <p className="text-sm text-muted-foreground py-4 text-center">{t('oauth.apps.empty')}</p>
        ) : (
          <ScrollArea className="h-72">
            {apps.map((app) => (
              <AppRow
                key={app.clientId}
                app={app}
                onRevoke={(clientId) => revokeConnectedApp.mutateAsync(clientId)}
              />
            ))}
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}
