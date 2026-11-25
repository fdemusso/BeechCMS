// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
import { OAUTH_SCOPES, type OAuthScope } from '@beechcms/core'
import {
  CONSENT_TEMPLATES,
  defaultTemplate,
  describeGrantedScopes,
  distinctTemplates,
  groupRequestedScopes,
  matchingTemplate,
  templateScopes,
  type ConsentTemplateId,
} from './consent-templates'

const templateById = (id: ConsentTemplateId) => CONSENT_TEMPLATES.find(template => template.id === id)!

describe('consent templates', () => {
  it('builds cumulative presets (reader, writer, full), ending with every OAuth scope', () => {
    const ids = CONSENT_TEMPLATES.map(template => template.id)
    const uncontained = CONSENT_TEMPLATES.slice(1).flatMap((template, index) =>
      CONSENT_TEMPLATES[index].scopes.filter(scope => !template.scopes.includes(scope)),
    )

    expect(ids).toEqual(['reader', 'writer', 'full'])
    expect(uncontained).toEqual([])
    expect([...templateById('full').scopes]).toEqual([...OAUTH_SCOPES])
  })

  it('lets every template delegate intent confirmation', () => {
    const templatesMissingAgentScopes = CONSENT_TEMPLATES
      .filter(template => !template.scopes.includes('agent:read') || !template.scopes.includes('agent:approve'))
      .map(template => template.id)

    expect(templatesMissingAgentScopes).toEqual([])
  })

  it('narrows the request to the template and drops denied scopes, in request order', () => {
    const requested: OAuthScope[] = ['content:write', 'schema:read', 'schema:write', 'content:read']

    const granted = templateScopes(templateById('writer'), requested, ['content:read'])

    expect(granted).toEqual(['content:write', 'schema:read'])
  })

  it('never adds a scope the client did not request', () => {
    const granted = templateScopes(templateById('full'), ['content:read'], [])

    expect(granted).toEqual(['content:read'])
  })

  it.each([
    [['content:read'], [], 'reader'],
    [['content:read', 'content:write'], [], 'writer'],
    [['schema:read', 'schema:write'], [], 'full'],
    [['users:write', 'schema:write'], ['schema:write'], 'full'],
    [['content:write', 'schema:write'], ['schema:write'], 'writer'],
  ] as const)('defaults the request %j with denied %j to the %s template', (requested, denied, expectedId) => {
    expect(defaultTemplate(requested, denied).id).toBe(expectedId)
  })

  it('deduplicates presets that grant the same scopes for beech-mcp', () => {
    const mcpRequested: OAuthScope[] = ['schema:read', 'schema:write', 'settings:read', 'agent:read', 'agent:approve']

    const resolved = distinctTemplates(mcpRequested, [])

    expect(resolved.map(item => item.template.id)).toEqual(['reader', 'full'])
    expect(resolved[0].scopes).toEqual(['schema:read', 'settings:read', 'agent:read', 'agent:approve'])
    expect(resolved[1].scopes).toEqual(mcpRequested)
  })

  it('keeps all three distinct presets for beech-mcp-cli', () => {
    const cliRequested = OAUTH_SCOPES.filter(scope => scope !== 'agent:approve')

    const resolved = distinctTemplates(cliRequested, [])

    expect(resolved.map(item => item.template.id)).toEqual(['reader', 'writer', 'full'])
  })

  it('describes granted scopes accurately without over- or under-promising', () => {
    expect(describeGrantedScopes([])).toBe('empty')
    expect(describeGrantedScopes(['schema:read', 'settings:read', 'agent:read'])).toBe('readOnly')
    expect(describeGrantedScopes(['schema:read', 'settings:read', 'agent:read', 'agent:approve'])).toBe('readWithApprove')
    expect(describeGrantedScopes(['content:read', 'content:write'])).toBe('writeContent')
    expect(describeGrantedScopes(['schema:read', 'schema:write', 'agent:approve'])).toBe('schemaWithApprove')
    expect(describeGrantedScopes(['content:read', 'schema:write', 'settings:write'])).toBe('fullWithSchema')
  })

  it('groups requested scopes by domain for compact display', () => {
    const mcpRequested: OAuthScope[] = ['schema:read', 'schema:write', 'settings:read', 'agent:read', 'agent:approve']

    const groups = groupRequestedScopes(mcpRequested)

    expect(groups).toEqual([
      { domain: 'schema', items: [{ scope: 'schema:read', action: 'read' }, { scope: 'schema:write', action: 'write' }] },
      { domain: 'settings', items: [{ scope: 'settings:read', action: 'read' }] },
      { domain: 'agent', items: [{ scope: 'agent:read', action: 'read' }, { scope: 'agent:approve', action: 'approve' }] },
    ])
  })

  it('detects whether a custom selection matches a preset or is custom', () => {
    const mcpRequested: OAuthScope[] = ['schema:read', 'schema:write', 'settings:read', 'agent:read', 'agent:approve']
    const options = distinctTemplates(mcpRequested, [])

    expect(matchingTemplate(new Set(['schema:read', 'settings:read', 'agent:read', 'agent:approve']), options)).toBe('reader')
    expect(matchingTemplate(new Set(['schema:read', 'schema:write']), options)).toBeNull()
  })
})
