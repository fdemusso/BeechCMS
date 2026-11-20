// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { RelativeTime } from '@/components/ui/relative-time'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  SETTINGS_TABLE_HEAD_REM,
  SETTINGS_TABLE_ROW_CLASS,
  SETTINGS_TABLE_ROW_REM,
  SettingsScroll,
  SettingsSection,
} from '@/components/ui/settings-section'
import { useConnectedApps, usePendingAgentIntents } from '../hooks/use-oauth-consent'
import { AgentIntentReviewDialog, AgentIntentRiskBadge } from './agent-intent-review-dialog'

/** "Pending agent actions": the caller's waiting intents, each opening the review dialog. No props. */
export function PendingAgentActionsSection() {
  const { t } = useTranslation()
  const { data: intents, isLoading, isError } = usePendingAgentIntents()
  const { data: apps } = useConnectedApps()
  const [reviewingId, setReviewingId] = React.useState<string | null>(null)

  const appNameOf = (clientId: string) => apps?.find((app) => app.clientId === clientId)?.name ?? clientId
  const reviewing = intents?.find((intent) => intent.id === reviewingId)

  return (
    <SettingsSection id="agent-actions" title={t('oauth.intents.title')} description={t('oauth.intents.description')}>
      {isLoading ? (
        <div role="status" className="space-y-3 py-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          <span className="sr-only">{t('common.loading')}</span>
        </div>
      ) : isError ? (
        <p className="py-4 text-sm text-status-danger-foreground">{t('oauth.intents.loadError')}</p>
      ) : !intents?.length ? (
        <p className="border-b border-border py-4 text-sm text-muted-foreground">{t('oauth.intents.empty')}</p>
      ) : (
        <SettingsScroll label={t('oauth.intents.list.label')} rowRem={SETTINGS_TABLE_ROW_REM} headerRem={SETTINGS_TABLE_HEAD_REM}>
          {/* The table must not scroll on its own, or the header could not stay above the rows. */}
          <Table containerClassName="overflow-visible" aria-label={t('oauth.intents.list.label')}>
            <TableHeader className="sticky top-0 z-10 bg-[var(--settings-page-bg)]">
              <TableRow>
                <TableHead>{t('oauth.intents.columns.action')}</TableHead>
                <TableHead>{t('oauth.intents.columns.app')}</TableHead>
                <TableHead>{t('oauth.intents.columns.risk')}</TableHead>
                <TableHead>{t('oauth.intents.columns.expires')}</TableHead>
                <TableHead className="text-right">{t('content.actions.label')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {intents.map((intent) => {
                const request = `${intent.method} ${intent.path}`
                return (
                  <TableRow key={intent.id} className={SETTINGS_TABLE_ROW_CLASS}>
                    <TableCell className="max-w-[320px]">
                      <span className="block truncate font-medium" title={intent.summary}>{intent.summary}</span>
                      <span className="block truncate font-mono text-xs text-muted-foreground" title={request}>{request}</span>
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <span className="block truncate text-muted-foreground">{appNameOf(intent.clientId)}</span>
                    </TableCell>
                    <TableCell><AgentIntentRiskBadge risk={intent.risk} /></TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      <RelativeTime value={intent.expiresAt} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={t('oauth.intents.reviewFor', { action: intent.summary })}
                        onClick={() => setReviewingId(intent.id)}
                      >
                        {t('oauth.intents.review')}
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </SettingsScroll>
      )}
      <AgentIntentReviewDialog
        intentId={reviewingId}
        appName={reviewing ? appNameOf(reviewing.clientId) : ''}
        onOpenChange={(open) => { if (!open) setReviewingId(null) }}
      />
    </SettingsSection>
  )
}
