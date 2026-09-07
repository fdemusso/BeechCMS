// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Loader } from 'reicon-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useOptionalAuth } from '@/lib/auth-context'
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
  const auth = useOptionalAuth()
  const user = auth?.user
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
        <CardHeader className="text-center space-y-2 pb-3">
          {/* Centered illustration */}
          <div className="flex justify-center pb-1">
            <img
              src={`${import.meta.env.BASE_URL}0auth_mcp.svg`}
              alt="OAuth MCP"
              className="h-20 sm:h-24 w-auto object-contain select-none"
              draggable={false}
            />
          </div>

          <div className="space-y-1">
            <CardTitle className="text-lg font-semibold tracking-tight">
              {t('oauth.consent.title', { client: metadata.client.name })}
            </CardTitle>
            <CardDescription className="text-xs">
              {t('oauth.consent.subtitle')}
            </CardDescription>
          </div>

          {/* User profile chip */}
          {user?.email && (
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
              <Avatar size="sm" className="size-4 border border-border">
                <AvatarFallback className="bg-primary/10 text-primary text-[9px] font-medium">
                  {(user.name?.[0] ?? user.email[0] ?? 'U').toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="font-medium text-foreground text-[11px] truncate max-w-[220px]">
                {user.email}
              </span>
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-3 pt-0">
          {/* Scopes list */}
          <div className="space-y-2">
            {metadata.requestedScopes.map((scope) => {
              const alreadyGranted = !metadata.newScopes.includes(scope)
              return (
                <div
                  key={scope}
                  className="flex items-start gap-2.5 rounded-lg border bg-muted/20 p-2.5 text-xs"
                >
                  <div className="pt-0.5 shrink-0">
                    <Checkbox
                      checked
                      disabled
                      aria-label={scope}
                      className="pointer-events-none data-checked:bg-primary"
                    />
                  </div>

                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="secondary" className="font-mono text-[11px] px-1.5 py-0">
                        {scope}
                      </Badge>
                      {alreadyGranted ? (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                          {t('oauth.consent.alreadyGranted')}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary font-normal">
                          {t('oauth.consent.required')}
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      {t(`oauth.consent.scopes.${scope}`)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Disclaimer & redirect notice */}
          <div className="space-y-2 pt-0.5">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {t('oauth.consent.disclaimer')}
            </p>
            <div className="rounded-md border bg-muted/30 px-2.5 py-1.5 text-[11px] text-muted-foreground leading-snug break-all">
              {t('oauth.consent.redirectNotice', { uri: metadata.redirectUri })}
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={submitConsent.isPending}
            onClick={() => decide(false)}
          >
            {t('oauth.consent.deny')}
          </Button>
          <Button
            size="sm"
            disabled={submitConsent.isPending}
            onClick={() => decide(true)}
          >
            {submitConsent.isPending && <Loader className="size-3.5 animate-spin mr-1.5" />}
            {t('oauth.consent.approve')}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
