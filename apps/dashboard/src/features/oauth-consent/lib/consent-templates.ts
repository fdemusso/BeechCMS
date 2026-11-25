// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { OAUTH_SCOPES, type OAuthScope } from '@beechcms/core'

export type ConsentTemplateId = 'reader' | 'writer' | 'full'

export type ConsentDomainId =
  | 'schema'
  | 'content'
  | 'media'
  | 'automations'
  | 'users'
  | 'settings'
  | 'analytics'
  | 'agent'

export type ConsentActionKind = 'read' | 'write' | 'delete' | 'approve'

export interface ScopeGroupItem {
  readonly scope: OAuthScope
  readonly action: ConsentActionKind
}

export interface ScopeGroup {
  readonly domain: ConsentDomainId
  readonly items: readonly ScopeGroupItem[]
}

const DOMAIN_DEFINITIONS: ReadonlyArray<{ domain: ConsentDomainId; items: readonly ScopeGroupItem[] }> = [
  { domain: 'schema', items: [{ scope: 'schema:read', action: 'read' }, { scope: 'schema:write', action: 'write' }] },
  {
    domain: 'content',
    items: [
      { scope: 'content:read', action: 'read' },
      { scope: 'content:write', action: 'write' },
      { scope: 'content:delete', action: 'delete' },
    ],
  },
  { domain: 'media', items: [{ scope: 'media:read', action: 'read' }, { scope: 'media:write', action: 'write' }] },
  {
    domain: 'automations',
    items: [{ scope: 'automations:read', action: 'read' }, { scope: 'automations:write', action: 'write' }],
  },
  { domain: 'users', items: [{ scope: 'users:read', action: 'read' }, { scope: 'users:write', action: 'write' }] },
  { domain: 'settings', items: [{ scope: 'settings:read', action: 'read' }, { scope: 'settings:write', action: 'write' }] },
  { domain: 'analytics', items: [{ scope: 'analytics:read', action: 'read' }] },
  { domain: 'agent', items: [{ scope: 'agent:read', action: 'read' }, { scope: 'agent:approve', action: 'approve' }] },
]

/** Groups requested scopes by resource domain, keeping only domains/actions actually requested. */
export function groupRequestedScopes(requested: readonly OAuthScope[]): ScopeGroup[] {
  const requestedSet = new Set<OAuthScope>(requested)
  const groups: ScopeGroup[] = []
  for (const def of DOMAIN_DEFINITIONS) {
    const items = def.items.filter(item => requestedSet.has(item.scope))
    if (items.length > 0) groups.push({ domain: def.domain, items })
  }
  return groups
}

/** Returns the preset whose resolved scope set matches `selected`, or `null` for a custom selection. */
export function matchingTemplate(
  selected: ReadonlySet<OAuthScope>,
  options: readonly ResolvedConsentTemplate[],
): ConsentTemplateId | null {
  const match = options.find(
    option => option.scopes.length === selected.size && option.scopes.every(scope => selected.has(scope)),
  )
  return match?.template.id ?? null
}

/** A preset level of delegation the user can pick on the consent screen. */
export interface ConsentTemplate {
  readonly id: ConsentTemplateId
  /** Ceiling of scopes this template delegates; always intersected with the client's request. */
  readonly scopes: readonly OAuthScope[]
}

/** A preset paired with the actual scopes it grants for a specific authorization request. */
export interface ResolvedConsentTemplate {
  readonly template: ConsentTemplate
  readonly scopes: readonly OAuthScope[]
}

export type ConsentSummaryKey =
  | 'empty'
  | 'readOnly'
  | 'readWithApprove'
  | 'writeContent'
  | 'writeContentWithApprove'
  | 'schemaOnly'
  | 'schemaWithApprove'
  | 'fullWithoutSchema'
  | 'fullWithSchema'

/**
 * The agent scopes sit in the smallest template so every template carries them: they only let a client
 * list its pending intents and run one the user confirms. Templates narrow the client's request, and the
 * script client never requests `agent:approve`.
 */
const READER_SCOPES: readonly OAuthScope[] = [
  'schema:read', 'content:read', 'media:read', 'automations:read', 'users:read', 'settings:read', 'analytics:read',
  'agent:read', 'agent:approve',
]
const WRITER_SCOPES: readonly OAuthScope[] = [...READER_SCOPES, 'content:write', 'content:delete', 'media:write']

/** Cumulative, smallest first: each template contains the previous one. */
export const CONSENT_TEMPLATES: readonly ConsentTemplate[] = [
  { id: 'reader', scopes: READER_SCOPES },
  { id: 'writer', scopes: WRITER_SCOPES },
  { id: 'full', scopes: OAUTH_SCOPES },
]

/** Scopes the consent will grant: `requested ∩ template − denied`, in request order. */
export function templateScopes(
  template: ConsentTemplate,
  requested: readonly OAuthScope[],
  denied: readonly OAuthScope[],
): OAuthScope[] {
  const allowed = new Set<OAuthScope>(template.scopes)
  const deniedSet = new Set<OAuthScope>(denied)
  return requested.filter(scope => allowed.has(scope) && !deniedSet.has(scope))
}

/**
 * Resolves each template against `requested` and `denied` and keeps only non-empty presets
 * with a distinct resulting scope set, preserving cumulative order (smallest preset first).
 */
export function distinctTemplates(
  requested: readonly OAuthScope[],
  denied: readonly OAuthScope[],
): ResolvedConsentTemplate[] {
  const seen = new Set<string>()
  const resolved: ResolvedConsentTemplate[] = []
  for (const template of CONSENT_TEMPLATES) {
    const scopes = templateScopes(template, requested, denied)
    if (scopes.length === 0) continue
    const key = scopes.join(' ')
    if (seen.has(key)) continue
    seen.add(key)
    resolved.push({ template, scopes })
  }
  return resolved
}

/** Picks the dynamic summary key describing the actual effect of `grantedScopes`. */
export function describeGrantedScopes(grantedScopes: readonly OAuthScope[]): ConsentSummaryKey {
  if (grantedScopes.length === 0) return 'empty'
  const set = new Set<OAuthScope>(grantedScopes)
  const hasAgentApprove = set.has('agent:approve')
  const hasSchemaWrite = set.has('schema:write')
  const hasContentWrite = set.has('content:write') || set.has('content:delete') || set.has('media:write')
  const hasAdminWrite = set.has('automations:write') || set.has('users:write') || set.has('settings:write')

  if (!hasContentWrite && !hasAdminWrite && !hasSchemaWrite) {
    return hasAgentApprove ? 'readWithApprove' : 'readOnly'
  }
  if (hasContentWrite && !hasAdminWrite && !hasSchemaWrite) {
    return hasAgentApprove ? 'writeContentWithApprove' : 'writeContent'
  }
  if (hasSchemaWrite && !hasContentWrite && !hasAdminWrite) {
    return hasAgentApprove ? 'schemaWithApprove' : 'schemaOnly'
  }
  return hasSchemaWrite ? 'fullWithSchema' : 'fullWithoutSchema'
}

/** The smallest template whose scopes cover every grantable requested scope; `full` when none does. */
export function defaultTemplate(
  requested: readonly OAuthScope[],
  denied: readonly OAuthScope[],
): ConsentTemplate {
  const deniedSet = new Set<OAuthScope>(denied)
  const grantable = requested.filter(scope => !deniedSet.has(scope))
  return (
    CONSENT_TEMPLATES.find(template => {
      const allowed = new Set<OAuthScope>(template.scopes)
      return grantable.every(scope => allowed.has(scope))
    }) ?? CONSENT_TEMPLATES[CONSENT_TEMPLATES.length - 1]
  )
}
