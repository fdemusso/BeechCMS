// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { OAUTH_SCOPES, type OAuthScope } from '@beechcms/core'

export type ConsentTemplateId = 'read' | 'editor' | 'admin' | 'developer'

/** A preset level of delegation the user can pick on the consent screen. */
export interface ConsentTemplate {
  readonly id: ConsentTemplateId
  /** Ceiling of scopes this template delegates; always intersected with the client's request. */
  readonly scopes: readonly OAuthScope[]
}

/**
 * The agent scopes sit in the smallest template so every template carries them: they only let a client
 * list its pending intents and run one the user confirms. Templates narrow the client's request, and the
 * script client never requests `agent:approve`.
 */
const READ_SCOPES: readonly OAuthScope[] = [
  'schema:read', 'content:read', 'media:read', 'automations:read', 'users:read', 'settings:read', 'analytics:read',
  'agent:read', 'agent:approve',
]
const EDITOR_SCOPES: readonly OAuthScope[] = [...READ_SCOPES, 'content:write', 'content:delete', 'media:write']
const ADMIN_SCOPES: readonly OAuthScope[] = [...EDITOR_SCOPES, 'automations:write', 'users:write', 'settings:write']

/** Cumulative, smallest first: each template contains the previous one. */
export const CONSENT_TEMPLATES: readonly ConsentTemplate[] = [
  { id: 'read', scopes: READ_SCOPES },
  { id: 'editor', scopes: EDITOR_SCOPES },
  { id: 'admin', scopes: ADMIN_SCOPES },
  { id: 'developer', scopes: OAUTH_SCOPES },
]

/** Scopes the consent will grant: `requested ∩ template − denied`, in request order. */
export function templateScopes(
  template: ConsentTemplate,
  requested: readonly OAuthScope[],
  denied: readonly OAuthScope[],
): OAuthScope[] {
  return requested.filter(scope => template.scopes.includes(scope) && !denied.includes(scope))
}

/** The smallest template whose scopes cover every grantable requested scope; `developer` when none does. */
export function defaultTemplate(
  requested: readonly OAuthScope[],
  denied: readonly OAuthScope[],
): ConsentTemplate {
  const grantable = requested.filter(scope => !denied.includes(scope))
  return (
    CONSENT_TEMPLATES.find(template => grantable.every(scope => template.scopes.includes(scope))) ??
    CONSENT_TEMPLATES[CONSENT_TEMPLATES.length - 1]
  )
}
