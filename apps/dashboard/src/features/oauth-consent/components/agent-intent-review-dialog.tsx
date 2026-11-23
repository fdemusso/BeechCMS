// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Loader as Loader2 } from '@/components/icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { RelativeTime } from '@/components/ui/relative-time'
import { Skeleton } from '@/components/ui/skeleton'
import { problemCode } from '@/lib/http/api-error'
import { useAgentIntent, useApproveAgentIntent, useRejectAgentIntent } from '../hooks/use-oauth-consent'
import type { AgentIntent, AgentIntentDetail } from '../types/oauth.types'

export interface AgentIntentReviewDialogProps {
  /** Intent to review; `null` keeps the dialog closed. */
  readonly intentId: string | null
  /** Display name of the OAuth client that asked (already resolved by the section). */
  readonly appName: string
  readonly onOpenChange: (open: boolean) => void
}

/** Risk of a pending intent: destructive stands out, publish stays neutral. */
export function AgentIntentRiskBadge({ risk }: { readonly risk: AgentIntent['risk'] }) {
  const { t } = useTranslation()
  return (
    <Badge variant={risk === 'destructive' ? 'destructive' : 'outline'}>
      {t(`oauth.intents.risk.${risk}`)}
    </Badge>
  )
}

/** Text of the stored request body: raw text as is, JSON indented, `null` when there is none. */
function formatBody(body: unknown): string | null {
  if (body === null || body === undefined) return null
  return typeof body === 'string' ? body : JSON.stringify(body, null, 2)
}

/** Toast key for a failed decision, or `null` when the failure is not one the server names. */
const PROBLEM_TOASTS: Readonly<Record<string, string>> = {
  intent_expired: 'oauth.intents.toast.expired',
  intent_not_pending: 'oauth.intents.toast.notPending',
  intent_not_found: 'oauth.intents.toast.notFound',
}

/** Approve/reject handlers for one intent; every failure toasts, and the ones the server names also close the dialog. */
function useIntentDecisions(intentId: string | null, onOpenChange: (open: boolean) => void) {
  const { t } = useTranslation()
  const approve = useApproveAgentIntent()
  const reject = useRejectAgentIntent()

  const handleFailure = (failure: unknown) => {
    const toastKey = PROBLEM_TOASTS[problemCode(failure) ?? '']
    if (!toastKey) {
      toast.error(t('oauth.intents.toast.error'))
      return
    }
    toast.error(t(toastKey))
    onOpenChange(false)
  }

  const handleApprove = async () => {
    if (!intentId) return
    try {
      const { result } = await approve.mutateAsync(intentId)
      if (result.status < 400) toast.success(t('oauth.intents.toast.executed'))
      else toast.error(t('oauth.intents.toast.failed', { status: result.status }))
      onOpenChange(false)
    } catch (failure) {
      handleFailure(failure)
    }
  }

  const handleReject = async () => {
    if (!intentId) return
    try {
      await reject.mutateAsync(intentId)
      toast.success(t('oauth.intents.toast.rejected'))
      onOpenChange(false)
    } catch (failure) {
      handleFailure(failure)
    }
  }

  return { handleApprove, handleReject, approving: approve.isPending, rejecting: reject.isPending }
}

/** What the dialog shows under its header: loading skeleton, load error, or the intent's request and stored body. */
function IntentDetails({ intent, isLoading, error }: {
  readonly intent: AgentIntentDetail | undefined
  readonly isLoading: boolean
  readonly error: unknown
}) {
  const { t } = useTranslation()

  if (isLoading) {
    return (
      <div role="status" className="space-y-3">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-24 w-full" />
        <span className="sr-only">{t('common.loading')}</span>
      </div>
    )
  }
  if (error) {
    const loadErrorKey = problemCode(error) === 'intent_not_found' ? 'oauth.intents.toast.notFound' : 'oauth.intents.dialog.loadError'
    return <p role="alert" className="text-sm text-status-danger-foreground">{t(loadErrorKey)}</p>
  }
  if (!intent) return null

  const body = formatBody(intent.body)
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">{t('oauth.intents.dialog.request')}</dt>
        <dd className="min-w-0 break-all font-mono">{intent.method} {intent.path}</dd>
        <dt className="text-muted-foreground">{t('oauth.intents.columns.risk')}</dt>
        <dd><AgentIntentRiskBadge risk={intent.risk} /></dd>
        <dt className="text-muted-foreground">{t('oauth.intents.dialog.requestedAt')}</dt>
        <dd><RelativeTime value={intent.createdAt} /></dd>
        <dt className="text-muted-foreground">{t('oauth.intents.columns.expires')}</dt>
        <dd><RelativeTime value={intent.expiresAt} /></dd>
      </dl>
      <div className="space-y-2">
        <h4 className="text-sm font-medium">{t('oauth.intents.dialog.body')}</h4>
        {body === null ? (
          <p className="text-sm text-muted-foreground">{t('oauth.intents.dialog.noBody')}</p>
        ) : (
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-3 font-mono text-xs">{body}</pre>
        )}
      </div>
    </div>
  )
}

/**
 * Review of one waiting agent action: what it would call, its stored request body, and the two decisions.
 * Approving replays the request once, as the signed-in person; the click is the confirmation.
 */
export function AgentIntentReviewDialog({ intentId, appName, onOpenChange }: AgentIntentReviewDialogProps) {
  const { t } = useTranslation()
  const { data: intent, isLoading, error } = useAgentIntent(intentId)
  const { handleApprove, handleReject, approving, rejecting } = useIntentDecisions(intentId, onOpenChange)
  const decisionsDisabled = approving || rejecting || !intent

  return (
    <Dialog open={intentId !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{intent?.summary ?? t('oauth.intents.title')}</DialogTitle>
          <DialogDescription>{t('oauth.intents.dialog.description', { app: appName })}</DialogDescription>
        </DialogHeader>

        <IntentDetails intent={intent} isLoading={isLoading} error={error} />

        <DialogFooter>
          <Button variant="outline" disabled={decisionsDisabled} onClick={handleReject}>
            {rejecting && <Loader2 aria-hidden className="size-4 animate-spin" />}
            {t('oauth.intents.reject')}
          </Button>
          <Button
            variant={intent?.risk === 'destructive' ? 'destructive' : 'default'}
            disabled={decisionsDisabled}
            onClick={handleApprove}
          >
            {approving && <Loader2 aria-hidden className="size-4 animate-spin" />}
            {t('oauth.intents.approve')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
