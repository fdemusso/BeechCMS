// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useId, useState, type ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import { formatScopes, type OAuthScope } from '@beechcms/core'
import { toast } from 'sonner'
import { Edit, Eye, Loader, Trash2 } from '@/components/icons'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useOptionalAuth } from '@/lib/auth-context'
import { useSubmitConsent } from '../hooks/use-oauth-consent'
import {
  CONSENT_TEMPLATES,
  defaultTemplate,
  describeGrantedScopes,
  distinctTemplates,
  groupRequestedScopes,
  matchingTemplate,
  templateScopes,
  type ConsentActionKind,
  type ConsentTemplateId,
} from '../lib/consent-templates'
import type { AuthorizationRequestMetadata, ConsentDecisionBody } from '../types/oauth.types'

type ActionIcon = ComponentType<{ size?: number | string; className?: string }>

type StandardSlot = Exclude<ConsentActionKind, 'approve'>

const ACTION_ICONS: Record<StandardSlot, ActionIcon> = {
  read: Eye,
  write: Edit,
  delete: Trash2,
}

const STANDARD_SLOTS: readonly StandardSlot[] = ['read', 'write', 'delete']

/** Reads one OAuth request parameter, defaulting to '' when the query string lacks it. */
function readParam(params: URLSearchParams, key: string): string {
  return params.get(key) ?? ''
}

/** Builds the consent POST body; `scope` overrides the URL scope string (the granted scopes on Allow). */
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

  const options = distinctTemplates(metadata.requestedScopes, metadata.deniedScopes)
  const groups = groupRequestedScopes(metadata.requestedScopes)
  const deniedSet = new Set(metadata.deniedScopes)
  const newSet = new Set(metadata.newScopes)

  const [selectedSet, setSelectedSet] = useState<Set<OAuthScope>>(() => {
    const initial = defaultTemplate(metadata.requestedScopes, metadata.deniedScopes)
    return new Set(templateScopes(initial, metadata.requestedScopes, metadata.deniedScopes))
  })

  // Keep grantable selection in requested order; denied scopes can never enter the grant.
  const grantedScopes = metadata.requestedScopes.filter(scope => selectedSet.has(scope) && !deniedSet.has(scope))
  const matchedPresetId = matchingTemplate(new Set(grantedScopes), options)
  const matchedIndex = options.findIndex(option => option.template.id === matchedPresetId)
  const isCustom = grantedScopes.length > 0 && options.length > 0 && matchedPresetId === null
  const summaryKey = describeGrantedScopes(grantedScopes)

  const actionLabel = (action: ConsentActionKind) =>
    action === 'delete' ? t('common.action.delete') : t(`oauth.consent.actions.${action}`)

  const applyTemplate = (id: ConsentTemplateId) => {
    const option = options.find(candidate => candidate.template.id === id)
    if (!option) return
    setSelectedSet(new Set(option.scopes))
  }

  const toggleScope = (scope: OAuthScope) => {
    if (deniedSet.has(scope)) return
    setSelectedSet(prev => {
      const next = new Set(prev)
      if (next.has(scope)) next.delete(scope)
      else next.add(scope)
      return next
    })
  }

  const toggleDomain = (scopes: readonly OAuthScope[]) => {
    const grantable = scopes.filter(scope => !deniedSet.has(scope))
    if (grantable.length === 0) return
    setSelectedSet(prev => {
      const next = new Set(prev)
      const allOn = grantable.every(scope => next.has(scope))
      for (const scope of grantable) {
        if (allOn) next.delete(scope)
        else next.add(scope)
      }
      return next
    })
  }

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
    <TooltipProvider>
      <div className="flex min-h-svh w-full items-center justify-center bg-background p-4 sm:p-6">
        <Card className="w-full max-w-lg">
          <CardHeader className="items-center text-center space-y-3 pt-2 pb-2">
            <img
              src={`${import.meta.env.BASE_URL}0auth_mcp.svg`}
              alt="OAuth MCP"
              className="mx-auto h-28 sm:h-32 w-auto object-contain select-none"
              draggable={false}
            />

            <div className="space-y-1">
              <CardTitle className="font-heading text-xl font-bold tracking-tight">
                {t('oauth.consent.title', { client: metadata.client.name })}
              </CardTitle>
              <CardDescription className="text-sm text-muted-foreground">
                {t('oauth.consent.subtitle')}
              </CardDescription>
            </div>

            {user?.email && (
              <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground">
                <Avatar size="sm" className="size-4 border border-border">
                  <AvatarFallback className="bg-category text-category-foreground text-xs font-medium">
                    {(user.name?.[0] ?? user.email[0] ?? 'U').toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="font-medium text-foreground text-xs truncate max-w-[240px]">
                  {user.email}
                </span>
              </div>
            )}
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Top access-level selector + dynamic summary */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <p id={templateLegendId} className="text-sm font-medium text-foreground">
                    {t('oauth.consent.template.legend')}
                  </p>
                  {isCustom && (
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      {t('oauth.consent.template.custom')}
                    </Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {t('oauth.consent.scopeCount', {
                    granted: grantedScopes.length,
                    total: metadata.requestedScopes.length,
                  })}
                </span>
              </div>

              {options.length > 1 && (
                <Tabs
                  value={matchedPresetId ?? ''}
                  onValueChange={(value) => applyTemplate(value as ConsentTemplateId)}
                >
                  <TabsList
                    variant="line"
                    aria-labelledby={templateLegendId}
                    className={cn(
                      'relative grid w-full h-9 gap-0 rounded-lg border border-border bg-muted p-[3px] select-none data-[variant=line]:rounded-lg',
                      options.length === 2 ? 'grid-cols-2' : 'grid-cols-3',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'pointer-events-none absolute inset-y-[3px] left-[3px] rounded-control bg-sidebar-active transition-[transform,opacity] duration-(--duration-enter) ease-out',
                        matchedIndex >= 0 ? 'opacity-100' : 'opacity-0 duration-(--duration-exit)',
                      )}
                      style={{
                        width: `calc((100% - 6px) / ${options.length})`,
                        transform: `translateX(${Math.max(0, matchedIndex) * 100}%)`,
                      }}
                    />
                    {options.map(({ template }) => (
                      <TabsTrigger
                        key={template.id}
                        value={template.id}
                        className="relative z-10 h-full cursor-pointer select-none text-muted-foreground transition-colors duration-(--duration-enter) after:hidden data-active:text-foreground data-active:bg-transparent data-active:shadow-none data-active:border-transparent focus-visible:border-transparent focus-visible:outline-0 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-ring dark:data-active:bg-transparent dark:data-active:border-transparent"
                      >
                        {t(`oauth.consent.template.${template.id}.label`)}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              )}

              {options.length === 0 && (
                <Tabs value="">
                  <TabsList aria-labelledby={templateLegendId} className="grid w-full h-9 grid-cols-3">
                    {CONSENT_TEMPLATES.map((template) => (
                      <TabsTrigger key={template.id} value={template.id} disabled>
                        {t(`oauth.consent.template.${template.id}.label`)}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              )}

              <p
                key={summaryKey}
                className="rounded-control bg-muted px-3 py-2 text-xs text-muted-foreground leading-relaxed animate-in fade-in-0 duration-(--duration-enter)"
              >
                {t(`oauth.consent.summary.${summaryKey}`)}
              </p>
            </div>

            {/* Grouped, interactive permissions */}
            <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
              {groups.map(({ domain, items }) => {
                const domainScopes = items.map(item => item.scope)
                const grantable = domainScopes.filter(scope => !deniedSet.has(scope))
                const deniedCount = domainScopes.length - grantable.length
                const allDenied = grantable.length === 0
                const selectedCount = grantable.filter(scope => selectedSet.has(scope)).length
                const allSelected = grantable.length > 0 && selectedCount === grantable.length
                const someSelected = selectedCount > 0 && selectedCount < grantable.length
                const allAlreadyGranted = grantable.length > 0 && grantable.every(scope => !newSet.has(scope))

                return (
                  <div
                    key={domain}
                    className={cn(
                      'flex items-center justify-between gap-3 px-3.5 py-2.5 transition-colors',
                      selectedCount > 0 ? 'bg-card' : 'bg-muted/40',
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Checkbox
                        checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                        disabled={allDenied}
                        onCheckedChange={() => toggleDomain(domainScopes)}
                        aria-label={t(`oauth.consent.domains.${domain}`)}
                        className="shrink-0 data-checked:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary/60 data-[state=indeterminate]:text-primary-foreground"
                      />

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            tabIndex={0}
                            className={cn(
                              'text-sm font-medium truncate cursor-help underline decoration-dotted decoration-muted-foreground/40 underline-offset-4 rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                              selectedCount > 0 ? 'text-foreground' : 'text-muted-foreground',
                            )}
                          >
                            {t(`oauth.consent.domains.${domain}`)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="flex-col items-start gap-1.5 py-2 max-w-xs">
                          <span className="font-medium leading-snug">
                            {t(`oauth.consent.domainDescriptions.${domain}`)}
                          </span>
                          <ul className="space-y-0.5 opacity-85">
                            {items.map(({ scope }) => (
                              <li key={scope} className="text-xs leading-snug">
                                • {t(`oauth.consent.scopes.${scope}`)}
                              </li>
                            ))}
                          </ul>
                        </TooltipContent>
                      </Tooltip>

                      {deniedCount > 0 && (
                        <Badge variant="outline" className="shrink-0 text-xs text-muted-foreground">
                          {t('oauth.consent.scope.denied.badge')}
                        </Badge>
                      )}
                      {!allDenied && selectedCount > 0 && allAlreadyGranted && (
                        <Badge variant="outline" className="shrink-0 text-xs text-muted-foreground">
                          {t('oauth.consent.scope.granted.badge')}
                        </Badge>
                      )}
                    </div>

                    {domain !== 'agent' && (
                      <div className="flex items-center shrink-0">
                        <ButtonGroup>
                          {STANDARD_SLOTS.map((action) => {
                            const item = items.find(candidate => candidate.action === action)
                            const Icon = ACTION_ICONS[action]
                            const label = actionLabel(action)
                            if (!item) {
                              return (
                                <button
                                  key={action}
                                  type="button"
                                  data-slot="button"
                                  disabled
                                  aria-label={`${t(`oauth.consent.domains.${domain}`)}: ${label}`}
                                  className="inline-flex size-7 cursor-not-allowed items-center justify-center rounded-control border border-border bg-transparent text-muted-foreground/30"
                                >
                                  <Icon size={16} className="shrink-0" />
                                </button>
                              )
                            }
                            const denied = deniedSet.has(item.scope)
                            const active = !denied && selectedSet.has(item.scope)
                            return (
                              <Tooltip key={item.scope}>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    data-slot="button"
                                    disabled={denied}
                                    aria-pressed={active}
                                    aria-label={`${t(`oauth.consent.domains.${domain}`)}: ${label}`}
                                    onClick={() => toggleScope(item.scope)}
                                    className={cn(
                                      'inline-flex size-7 items-center justify-center rounded-control border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                      denied && 'cursor-not-allowed border-border bg-transparent text-muted-foreground/35',
                                      !denied && active && 'border-foreground/30 bg-muted text-foreground hover:bg-muted-strong',
                                      !denied && !active && 'border-border bg-transparent text-muted-foreground/60 hover:bg-muted/50 hover:text-foreground',
                                    )}
                                  >
                                    <Icon size={16} className="shrink-0" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="flex-col items-start gap-0.5 py-1.5 max-w-xs">
                                  <span className="font-medium">{label}</span>
                                  <span className="opacity-80">{t(`oauth.consent.scopes.${item.scope}`)}</span>
                                </TooltipContent>
                              </Tooltip>
                            )
                          })}
                        </ButtonGroup>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>

          <CardFooter className="flex items-center justify-end gap-2">
            <Button
              variant="destructive"
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
    </TooltipProvider>
  )
}
