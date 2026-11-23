// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, expect, it } from 'vitest'
import { OPERATION_CATALOG } from '@beechcms/core'
import { searchOperations, type OperationSearchOptions } from './catalog-search.js'

const SIGNATURE_OPTIONS: OperationSearchOptions = { detail: 'signature', limit: 50, allowedScopes: null }

describe('searchOperations', () => {
  it('a query matching an operation id ranks that operation first', () => {
    const hits = searchOperations('bulk update', SIGNATURE_OPTIONS)

    expect(hits[0]?.id).toBe('content.bulkUpdate')
  })

  it('name detail returns only id and summary', () => {
    const hits = searchOperations('bulk update', { ...SIGNATURE_OPTIONS, detail: 'name' })

    expect(hits.length).toBeGreaterThan(0)
    expect(Object.keys(hits[0]).sort()).toEqual(['id', 'summary'])
  })

  it('full detail adds path params and the docs resource uri', () => {
    const hits = searchOperations('media.downloadUrl', { ...SIGNATURE_OPTIONS, detail: 'full' })

    const download = hits.find(hit => hit.id === 'media.downloadUrl')
    expect(download?.pathParams).toEqual(['key'])
    expect(download?.docs?.startsWith('beechcms-docs://reference/')).toBe(true)
  })

  it('excluded operations never appear', () => {
    const excludedIds = new Set(OPERATION_CATALOG.filter(operation => operation.exposure === 'excluded').map(operation => operation.id))

    const hits = searchOperations('password', SIGNATURE_OPTIONS)

    expect(hits.filter(hit => excludedIds.has(hit.id))).toEqual([])
  })

  it('allowed scopes drop operations outside the script grant', () => {
    const hits = searchOperations('content', { ...SIGNATURE_OPTIONS, allowedScopes: ['content:read'] })

    expect(hits.length).toBeGreaterThan(0)
    expect(hits.every(hit => hit.scope === 'content:read')).toBe(true)
  })

  it('request-dependent risk is reported as such', () => {
    const hits = searchOperations('content.delete', SIGNATURE_OPTIONS)

    const hit = hits.find(candidate => candidate.id === 'content.delete')
    expect(hit?.risk).toBe('request-dependent')
    expect(hit?.approval).toBe('depends-on-request')
  })

  it('operations scripts cannot call carry a null sdk and a note', () => {
    const hits = searchOperations('intents.approve', SIGNATURE_OPTIONS)

    const hit = hits.find(candidate => candidate.id === 'intents.approve')
    expect(hit?.sdk).toBeNull()
    expect(hit?.note).toBeTruthy()
  })

  it('the approval rule follows the static risk', () => {
    const expectations: [id: string, approval: string][] = [
      ['intents.list', 'never'],
      ['media.presign', 'never'],
      ['automations.toggle', 'in-production'],
      ['automations.delete', 'always'],
    ]

    const approvals = expectations.map(([id]) => searchOperations(id, SIGNATURE_OPTIONS).find(hit => hit.id === id)?.approval)

    expect(approvals).toEqual(expectations.map(([, approval]) => approval))
  })

  it('an empty or punctuation-only query returns nothing', () => {
    const hits = [searchOperations('', SIGNATURE_OPTIONS), searchOperations(' ./_:- ', SIGNATURE_OPTIONS)]

    expect(hits).toEqual([[], []])
  })

  it('the same query returns the same list', () => {
    const first = searchOperations('seed', SIGNATURE_OPTIONS)

    const second = searchOperations('seed', SIGNATURE_OPTIONS)

    expect(second).toEqual(first)
  })
})
