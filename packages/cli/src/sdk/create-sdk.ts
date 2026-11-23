// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module sdk/create-sdk
 * Assembles the `beech` SDK object from {@link SDK_OPERATIONS}. Internal until `beech run` (sprint 07).
 */

import { OPERATION_CATALOG } from '@beechcms/core'
import { createHelpers } from './helpers.js'
import { createInvoker } from './invoke.js'
import { PRECONDITION_OPERATIONS, SDK_OPERATIONS } from './operations.js'
import type { BeechSdk, BeechSdkOptions, SdkJournal, SdkPreconditionOptions, SdkQuery, SeedRegistryShape } from './types.js'

export interface BeechSdkHandle<R> {
  sdk: BeechSdk<R>
  journal: SdkJournal
}

type SdkMethod = (...args: unknown[]) => Promise<unknown>

const PATH_PARAM_PATTERN = /:[A-Za-z_]+/g
const QUERY_METHODS: ReadonlySet<string> = new Set(['GET', 'DELETE'])

const OPERATIONS_BY_ID = new Map(OPERATION_CATALOG.map(operation => [operation.id, operation]))

/** `ifMatch` becomes `If-Match: "<updatedAt>"`; `null` becomes `If-None-Match: *` (write only while nothing is stored). */
function preconditionHeaders(options: SdkPreconditionOptions): Record<string, string> {
  return options.ifMatch === null ? { 'If-None-Match': '*' } : { 'If-Match': `"${options.ifMatch}"` }
}

function isPreconditionOptions(value: unknown): value is SdkPreconditionOptions {
  return typeof value === 'object' && value !== null && 'ifMatch' in value
}

function buildMethod(invoker: ReturnType<typeof createInvoker>, operationId: string): SdkMethod {
  const operation = OPERATIONS_BY_ID.get(operationId)
  if (operation === undefined) throw new Error(`${operationId} is not in the operation catalog`)
  const pathParamCount = operation.path.match(PATH_PARAM_PATTERN)?.length ?? 0
  const takesQuery = QUERY_METHODS.has(operation.method)

  const needsPrecondition = PRECONDITION_OPERATIONS.has(operationId)

  return (...args) => {
    const pathParams = args.slice(0, pathParamCount).map(String)
    if (needsPrecondition) {
      // A DELETE has no body and these methods take no query, so the options sit right after the path params.
      const body = takesQuery ? undefined : args[pathParamCount]
      const options = args[pathParamCount + (takesQuery ? 0 : 1)]
      if (!isPreconditionOptions(options)) {
        return Promise.reject(new Error(`${operationId} needs { ifMatch }: the updatedAt read with get(), or null when nothing is stored yet`))
      }
      return invoker.call(operationId, pathParams, { body, headers: preconditionHeaders(options) })
    }
    const extra = args[pathParamCount]
    return invoker.call(operationId, pathParams, takesQuery ? { query: extra as SdkQuery | undefined } : { body: extra })
  }
}

/** Builds the SDK and its journal. */
export function createBeechSdk<R = SeedRegistryShape>(options: BeechSdkOptions): BeechSdkHandle<R> {
  const invoker = createInvoker(options)

  const namespaces: Record<string, Record<string, SdkMethod>> = {}
  for (const [namespace, methods] of Object.entries(SDK_OPERATIONS)) {
    namespaces[namespace] = Object.fromEntries(
      Object.entries(methods).map(([method, operationId]) => [method, buildMethod(invoker, operationId)]),
    )
  }

  // Key parity with BeechSdk is enforced by `satisfies SdkOperationMap`; behaviour by sdk-parity.test.ts.
  const sdk = namespaces as unknown as BeechSdk<SeedRegistryShape>
  const helpers = createHelpers(invoker, sdk)
  Object.assign(sdk.content, {
    listAll: helpers.listAll,
    importFile: helpers.importFile,
    waitForImport: helpers.waitForImport,
  })
  Object.assign(sdk.media, { uploadFile: helpers.uploadFile })

  return { sdk: sdk as unknown as BeechSdk<R>, journal: invoker.journal }
}
