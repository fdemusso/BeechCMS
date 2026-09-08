// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { isAxiosError } from 'axios'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuthorizationRequest, useSubmitConsent } from '../hooks/use-oauth-consent'
import { ConsentScreen } from '../components/consent-screen'

function ConsentSplash() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  )
}

export function ConsentPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { data, isLoading, error } = useAuthorizationRequest(searchParams)
  const submitConsent = useSubmitConsent()
  const silentConsentFired = React.useRef(false)

  React.useEffect(() => {
    if (!data || data.consentRequired || silentConsentFired.current) return
    silentConsentFired.current = true
    submitConsent.mutate(
      {
        response_type: searchParams.get('response_type') ?? '',
        client_id: searchParams.get('client_id') ?? '',
        redirect_uri: searchParams.get('redirect_uri') ?? '',
        scope: searchParams.get('scope') ?? '',
        state: searchParams.get('state') ?? '',
        code_challenge: searchParams.get('code_challenge') ?? '',
        code_challenge_method: searchParams.get('code_challenge_method') ?? '',
        approved: true,
      },
      { onSuccess: ({ redirectTo }) => window.location.assign(redirectTo) },
    )
  }, [data, searchParams, submitConsent])

  if (isLoading) return <ConsentSplash />

  if (error) {
    const description = isAxiosError(error) ? error.response?.data?.error_description : undefined
    return (
      <div className="flex min-h-svh w-full items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{t('oauth.consent.errorTitle')}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </CardHeader>
          <CardContent />
          <CardFooter>
            <Button onClick={() => navigate('/')}>{t('oauth.consent.backToDashboard')}</Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  if (!data || !data.consentRequired) return <ConsentSplash />

  return <ConsentScreen metadata={data} params={searchParams} />
}
