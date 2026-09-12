// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { BeechBrowserClient, BeechClientConfig, Listable, ListQuery, Single, BeechProblem, BeechResult, RequestOptions } from '../types.js'
import { SCHEMA_FINGERPRINT } from '../types.js'
import { FluentQueryBuilder, buildSearchParams } from '../query-builder.js'
import { request, validateClientConfig } from '../http.js'

function verifySchemaFingerprint<T>(res: BeechResult<T>): BeechResult<T> {
  const revision = res.headers?.get('X-Schema-Revision')
  if (SCHEMA_FINGERPRINT && revision && revision !== SCHEMA_FINGERPRINT) {
    return { data: null, error: { type: 'schema_drift', title: 'Stale Types', status: 409, detail: 'Client types stale, regenerate with `beech types generate`' } as BeechProblem }
  }
  return res
}

export function createBeechBrowserClient<TRegistry = Record<string, unknown>>(
  config: BeechClientConfig,
): BeechBrowserClient<TRegistry> {
  validateClientConfig(config)

  return {
    collection(seed) {
      type TRow = TRegistry[typeof seed]
      const enc = encodeURIComponent(seed)
      
      const executor = {
        list: async (q: ListQuery<TRow>, options?: RequestOptions & { validate?: boolean }) => {
          const res = await request<Listable<TRow>>(config, 'GET', `/${enc}`, {
            params: buildSearchParams(q as ListQuery<Record<string, unknown>>),
            options,
          })
          const checked = verifySchemaFingerprint(res)
          if (options?.validate && !checked.error) {
            // stub zod parsing/validation logic
          }
          return checked
        },
        first: async (q: ListQuery<TRow>, options?: RequestOptions) => {
          // to get first, we can just limit to 1
          const qFirst = { ...q, limit: 1 }
          const res = await request<Listable<TRow>>(config, 'GET', `/${enc}`, {
            params: buildSearchParams(qFirst as ListQuery<Record<string, unknown>>),
            options,
          })
          const checked = verifySchemaFingerprint(res)
          if (checked.error) return checked as unknown as BeechResult<Single<TRow>>
          const singleData = checked.data.data[0]
          if (!singleData) return { data: null, error: { type: 'not_found', title: 'Not Found', status: 404, detail: 'No result' } as BeechProblem }
          return { data: { data: singleData, meta: { seed: seed as string } }, error: null }
        }
      }
      return new FluentQueryBuilder<TRow>(executor)
    },
  }
}

/** Alias for createBeechBrowserClient */
export const createBeechClient = createBeechBrowserClient
