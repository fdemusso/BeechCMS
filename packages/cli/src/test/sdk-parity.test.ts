// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { OPERATION_CATALOG, matchOperation, type AgentOperationSpec } from '@beechcms/core'
import { createBeechSdk } from '../sdk/create-sdk.js'
import { SDK_OMITTED_OPERATIONS, SDK_OPERATIONS } from '../sdk/operations.js'
import type { SdkRequest, SdkTransport } from '../sdk/types.js'

const SDK_SOURCE_DIR = join(import.meta.dirname, '..', 'sdk')

const agentOperations = OPERATION_CATALOG.filter((operation): operation is AgentOperationSpec => operation.exposure === 'agent')
const sdkEntries = Object.entries(SDK_OPERATIONS).flatMap(([namespace, methods]) =>
  Object.entries(methods).map(([method, operationId]) => ({ namespace, method, operationId: operationId as string })),
)

type DynamicSdk = Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>

describe('SDK method map', () => {
  function recordingTransport(responseBody: string = '{"ok":1}') {
    const requests: SdkRequest[] = []
    const transport: SdkTransport = {
      async send(request) {
        requests.push(request)
        return new Response(responseBody, { status: 200, headers: { 'Content-Type': 'application/json' } })
      },
    }
    return { requests, transport }
  }

  function argumentsFor(operation: AgentOperationSpec): unknown[] {
    const pathParams = (operation.path.match(/:[A-Za-z_]+/g) ?? []).map((_, index) => `p${index}`)
    return operation.method === 'GET' || operation.method === 'DELETE' ? pathParams : [...pathParams, {}]
  }

  it('every agent operation is an SDK method or a reasoned omission', () => {
    const covered = new Set([...sdkEntries.map(entry => entry.operationId), ...Object.keys(SDK_OMITTED_OPERATIONS)])
    const agentIds = new Set(agentOperations.map(operation => operation.id))

    expect(covered).toEqual(agentIds)
  })

  it('every SDK method names an agent operation spelled namespace.method', () => {
    const agentIds = new Set(agentOperations.map(operation => operation.id))

    const misnamed = sdkEntries.filter(entry => entry.operationId !== `${entry.namespace}.${entry.method}` || !agentIds.has(entry.operationId))

    expect(misnamed).toEqual([])
  })

  it('omits exactly intents.approve and media.upload, each with a reason', () => {
    const omitted = Object.entries(SDK_OMITTED_OPERATIONS)

    expect(omitted.map(([id]) => id).sort()).toEqual(['intents.approve', 'media.upload'])
    expect(omitted.every(([, reason]) => reason.length > 0)).toBe(true)
  })

  it('each method sends the method and path its catalog operation matches', async () => {
    const { requests, transport } = recordingTransport()
    const { sdk } = createBeechSdk({ transport })
    const dynamicSdk = sdk as unknown as DynamicSdk

    for (const { namespace, method, operationId } of sdkEntries) {
      const operation = agentOperations.find(candidate => candidate.id === operationId)!
      await dynamicSdk[namespace][method](...argumentsFor(operation))
    }

    expect(requests).toHaveLength(sdkEntries.length)
    const resolvedIds = requests.map(request => matchOperation(request.method, request.path.split('?')[0])?.id)
    expect(resolvedIds).toEqual(sdkEntries.map(entry => entry.operationId))
  })

  it('read operations resolve to the raw body and others to an executed outcome', async () => {
    const { transport } = recordingTransport()
    const { sdk } = createBeechSdk({ transport })
    const dynamicSdk = sdk as unknown as DynamicSdk

    for (const { namespace, method, operationId } of sdkEntries) {
      const operation = agentOperations.find(candidate => candidate.id === operationId)!
      const result = await dynamicSdk[namespace][method](...argumentsFor(operation))

      expect(result).toEqual(operation.risk === 'read' ? { ok: 1 } : { kind: 'executed', status: 200, data: { ok: 1 } })
    }
  })

  it('the public barrel never reaches the api-client adapter', () => {
    // Reads the package's own source: this guards the published d.ts from naming the private api-client.
    const sources = new Map(
      readdirSync(SDK_SOURCE_DIR).filter(file => file.endsWith('.ts')).map(file => [file, readFileSync(join(SDK_SOURCE_DIR, file), 'utf8')]),
    )
    const reachable = new Set<string>()
    const pending = ['index.ts']
    while (pending.length > 0) {
      const file = pending.pop()!
      if (reachable.has(file)) continue
      reachable.add(file)
      for (const match of sources.get(file)!.matchAll(/from '\.\/([\w-]+)\.js'/g)) pending.push(`${match[1]}.ts`)
    }

    const importingApiClient = [...sources].filter(([, text]) => text.includes('@beechcms/api-client')).map(([file]) => file)

    expect(importingApiClient).toEqual(['api-client-transport.ts'])
    expect(reachable.has('api-client-transport.ts')).toBe(false)
  })
})
