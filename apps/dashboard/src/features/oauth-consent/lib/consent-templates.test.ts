// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
import { OAUTH_SCOPES, type OAuthScope } from '@beechcms/core'
import { CONSENT_TEMPLATES, defaultTemplate, templateScopes, type ConsentTemplateId } from './consent-templates'

const templateById = (id: ConsentTemplateId) => CONSENT_TEMPLATES.find(template => template.id === id)!

describe('consent templates', () => {
  it('builds cumulative templates, smallest first, ending with every OAuth scope', () => {
    const ids = CONSENT_TEMPLATES.map(template => template.id)
    const uncontained = CONSENT_TEMPLATES.slice(1).flatMap((template, index) =>
      CONSENT_TEMPLATES[index].scopes.filter(scope => !template.scopes.includes(scope)),
    )

    expect(ids).toEqual(['read', 'editor', 'admin', 'developer'])
    expect(uncontained).toEqual([])
    expect([...templateById('developer').scopes]).toEqual([...OAUTH_SCOPES])
  })

  it('lets every template delegate intent confirmation', () => {
    const templatesMissingAgentScopes = CONSENT_TEMPLATES
      .filter(template => !template.scopes.includes('agent:read') || !template.scopes.includes('agent:approve'))
      .map(template => template.id)

    expect(templatesMissingAgentScopes).toEqual([])
  })

  it('narrows the request to the template and drops denied scopes, in request order', () => {
    const requested: OAuthScope[] = ['content:write', 'schema:read', 'schema:write', 'content:read']

    const granted = templateScopes(templateById('editor'), requested, ['content:read'])

    expect(granted).toEqual(['content:write', 'schema:read'])
  })

  it('never adds a scope the client did not request', () => {
    const granted = templateScopes(templateById('admin'), ['content:read'], [])

    expect(granted).toEqual(['content:read'])
  })

  it.each([
    [['content:read'], [], 'read'],
    [['content:read', 'content:write'], [], 'editor'],
    [['schema:read', 'schema:write'], [], 'developer'],
    [['users:write', 'schema:write'], ['schema:write'], 'admin'],
  ] as const)('defaults the request %j with denied %j to the %s template', (requested, denied, expectedId) => {
    expect(defaultTemplate(requested, denied).id).toBe(expectedId)
  })
})
