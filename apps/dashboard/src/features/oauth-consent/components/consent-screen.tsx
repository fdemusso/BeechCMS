// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatScopes } from '@beechcms/core'
import { toast } from 'sonner'
import { Loader } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useOptionalAuth } from '@/lib/auth-context'
import { useSubmitConsent } from '../hooks/use-oauth-consent'
import { CONSENT_TEMPLATES, defaultTemplate, templateScopes, type ConsentTemplateId } from '../lib/consent-templates'
import type { AuthorizationRequestMetadata, ConsentDecisionBody } from '../types/oauth.types'

/** Reads one OAuth request parameter, defaulting to '' when the query string lacks it. */
function readParam(params: URLSearchParams, key: string): string {
  return params.get(key) ?? ''
}

/** Builds the consent POST body; `scope` overrides the URL scope string (the template's grant on Allow). */
function buildConsentBody(params: URLSearchParams, approved: boolean, scope = readParam(params, 'scope')): ConsentDecisionBody {
  return {
    response_type: readParam(params, 'response_type'),
    client_id: readParam(params, 'client_id'),
    redirect_uri: readParam(params, 'redirect_uri'),
    scope,
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
  const templateLegendId = useId()
  const [templateId, setTemplateId] = useState<ConsentTemplateId>(
    () => defaultTemplate(metadata.requestedScopes, metadata.deniedScopes).id,
  )
  const selectedTemplate = CONSENT_TEMPLATES.find(template => template.id === templateId) ?? CONSENT_TEMPLATES[0]
  const grantedScopes = templateScopes(selectedTemplate, metadata.requestedScopes, metadata.deniedScopes)
  const deniedSet = new Set(metadata.deniedScopes)
  const grantedSet = new Set(grantedScopes)
  const newSet = new Set(metadata.newScopes)

  const decide = async (approved: boolean) => {
    try {
      const body = approved ? buildConsentBody(params, true, formatScopes(grantedScopes)) : buildConsentBody(params, false)
      const { redirectTo } = await submitConsent.mutateAsync(body)
      window.location.assign(redirectTo)
    } catch {
      toast.error(t('oauth.consent.submit.error'))
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
            <CardTitle className="text-xl font-bold tracking-tight">
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
                <AvatarFallback className="bg-muted text-foreground text-xs font-medium">
                  {(user.name?.[0] ?? user.email[0] ?? 'U').toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="font-medium text-foreground text-xs truncate max-w-[220px]">
                {user.email}
              </span>
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-3 pt-0">
          {/* Template picker */}
          <div className="space-y-2">
            <p id={templateLegendId} className="text-sm font-medium">
              {t('oauth.consent.template.legend')}
            </p>
            <RadioGroup
              aria-labelledby={templateLegendId}
              value={templateId}
              onValueChange={(value) => setTemplateId(value as ConsentTemplateId)}
              className="grid-cols-1 gap-2 sm:grid-cols-2"
            >
              {CONSENT_TEMPLATES.map((template) => (
                <RadioGroupItem
                  key={template.id}
                  value={template.id}
                  disabled={templateScopes(template, metadata.requestedScopes, metadata.deniedScopes).length === 0}
                  className="flex-col items-start justify-start gap-0.5 text-left"
                >
                  <span className="text-sm font-medium">{t(`oauth.consent.template.${template.id}.label`)}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {t(`oauth.consent.template.${template.id}.description`)}
                  </span>
                </RadioGroupItem>
              ))}
            </RadioGroup>
          </div>

          {/* Scopes list */}
          <div className="space-y-2">
            {metadata.requestedScopes.map((scope) => {
              const denied = deniedSet.has(scope)
              const granted = grantedSet.has(scope)
              const alreadyGranted = !newSet.has(scope)
              return (
                <div
                  key={scope}
                  className="flex items-start gap-2.5 rounded-lg border bg-muted/20 p-2.5 text-xs"
                >
                  <div className="pt-0.5 shrink-0">
                    <Checkbox
                      checked={granted}
                      disabled
                      aria-label={scope}
                      className="pointer-events-none data-checked:bg-primary"
                    />
                  </div>

                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="secondary" className="font-mono text-xs px-1.5 py-0">
                        {scope}
                      </Badge>
                      {denied && (
                        <Badge variant="outline" className="text-xs px-1.5 py-0 text-muted-foreground">
                          {t('oauth.consent.scope.denied.badge')}
                        </Badge>
                      )}
                      {granted && alreadyGranted && (
                        <Badge variant="outline" className="text-xs px-1.5 py-0 text-muted-foreground">
                          {t('oauth.consent.scope.granted.badge')}
                        </Badge>
                      )}
                      {granted && !alreadyGranted && (
                        <Badge variant="outline" className="text-xs px-1.5 py-0 border-primary/30 text-foreground font-normal">
                          {t('oauth.consent.required')}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-snug">
                      {t(`oauth.consent.scopes.${scope}`)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Disclaimer & redirect notice */}
          <div className="space-y-2 pt-0.5">
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t('oauth.consent.disclaimer')}
            </p>
            <div className="rounded-control border bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground leading-snug break-all">
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
            disabled={submitConsent.isPending || grantedScopes.length === 0}
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
