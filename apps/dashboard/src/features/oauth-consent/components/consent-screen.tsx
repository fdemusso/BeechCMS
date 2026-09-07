// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Key, Loader } from 'reicon-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { useSubmitConsent } from '../hooks/use-oauth-consent'
import type { AuthorizationRequestMetadata, ConsentDecisionBody } from '../types/oauth.types'

/** Reads one OAuth request parameter, defaulting to '' when the query string lacks it. */
function readParam(params: URLSearchParams, key: string): string {
  return params.get(key) ?? ''
}

function buildConsentBody(params: URLSearchParams, approved: boolean): ConsentDecisionBody {
  return {
    response_type: readParam(params, 'response_type'),
    client_id: readParam(params, 'client_id'),
    redirect_uri: readParam(params, 'redirect_uri'),
    scope: readParam(params, 'scope'),
    state: readParam(params, 'state'),
    code_challenge: readParam(params, 'code_challenge'),
    code_challenge_method: readParam(params, 'code_challenge_method'),
    approved,
  }
}

export interface ConsentScreenProps {
  readonly metadata: AuthorizationRequestMetadata
  readonly params: URLSearchParams
}

export function ConsentScreen({ metadata, params }: ConsentScreenProps) {
  const { t } = useTranslation()
  const submitConsent = useSubmitConsent()

  const decide = async (approved: boolean) => {
    try {
      const { redirectTo } = await submitConsent.mutateAsync(buildConsentBody(params, approved))
      window.location.assign(redirectTo)
    } catch {
      toast.error(t('oauth.consent.submitError'))
    }
  }

  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary mb-2">
            <Key className="size-4" />
          </div>
          <CardTitle>{t('oauth.consent.title', { client: metadata.client.name })}</CardTitle>
          <CardDescription>{t('oauth.consent.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {metadata.requestedScopes.map((scope) => {
            const alreadyGranted = !metadata.newScopes.includes(scope)
            return (
              <div key={scope} className="flex items-center gap-2.5">
                <Badge variant={alreadyGranted ? 'secondary' : 'default'}>{scope}</Badge>
                <span className="text-sm text-muted-foreground">
                  {t(`oauth.consent.scopes.${scope}`)}
                  {alreadyGranted && ` (${t('oauth.consent.alreadyGranted')})`}
                </span>
              </div>
            )
          })}
          <Separator />
          <Alert>
            <AlertDescription>
              {t('oauth.consent.redirectNotice', { uri: metadata.redirectUri })}
            </AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          <Button variant="outline" disabled={submitConsent.isPending} onClick={() => decide(false)}>
            {t('oauth.consent.deny')}
          </Button>
          <Button disabled={submitConsent.isPending} onClick={() => decide(true)}>
            {submitConsent.isPending && <Loader className="size-4 animate-spin" />}
            {t('oauth.consent.approve')}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
