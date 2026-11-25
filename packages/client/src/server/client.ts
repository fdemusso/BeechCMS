// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { BeechServerClientConfig, BeechResult, BeechServerClient, Listable, ListQuery, Single, BeechProblem, RequestOptions } from '../types.js'
import { FluentQueryBuilder, buildSearchParams } from '../query-builder.js'
import { request, resolveServerConfig, verifySchemaFingerprint } from '../http.js'

function normalizeInput(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return input
  }
  const obj = input as Record<string, unknown>
  if ('data' in obj && obj.data && typeof obj.data === 'object') {
    return input
  }
  const { slug, status, ...rest } = obj
  return {
    data: rest,
    ...(typeof slug === 'string' ? { slug } : {}),
    ...(typeof status === 'string' ? { status } : {}),
  }
}

function normalizeSingleResult<T>(result: BeechResult<Single<T>>, seed: string): BeechResult<Single<T>> {
  if (result.error || !result.data) {
    return result
  }
  const raw = result.data as unknown as Record<string, unknown>
  if ('data' in raw && raw.data !== undefined) {
    return result
  }
  return {
    error: null,
    data: {
      data: raw as unknown as T,
      meta: { seed },
      ...raw,
    } as Single<T>,
  }
}

export function createBeechServerClient<TRegistry = Record<string, unknown>>(
  config: BeechServerClientConfig,
): BeechServerClient<TRegistry> {
  const httpConfig = resolveServerConfig(config)

  return {
    collection(seed) {
      type TRow = TRegistry[typeof seed]
      const enc = encodeURIComponent(seed)
      
      const executor = {
        list: async (q: ListQuery<TRow>, options?: RequestOptions & { validate?: boolean }) => {
          const res = await request<Listable<TRow>>(httpConfig, 'GET', `/${enc}`, {
            params: buildSearchParams(q as ListQuery<Record<string, unknown>>),
            options,
          })
          const checked = verifySchemaFingerprint(httpConfig, res)
          if (options?.validate && !checked.error) {
            // stub zod parsing/validation logic
          }
          return checked
        },
        first: async (q: ListQuery<TRow>, options?: RequestOptions) => {
          const qFirst = { ...q, limit: 1 }
          const res = await request<Listable<TRow>>(httpConfig, 'GET', `/${enc}`, {
            params: buildSearchParams(qFirst as ListQuery<Record<string, unknown>>),
            options,
          })
          const checked = verifySchemaFingerprint(httpConfig, res)
          if (checked.error) return checked as unknown as BeechResult<Single<TRow>>
          const singleData = checked.data.data[0]
          if (!singleData) return { data: null, error: { type: 'not_found', title: 'Not Found', status: 404, detail: 'No result' } as BeechProblem }
          return { data: { data: singleData, meta: { seed: seed as string } }, error: null }
        }
      }
      
      const builder = new FluentQueryBuilder<TRow>(executor)
      
      // Merge create/update methods into the returned object
      return Object.assign(builder, {
        create: async (input: Partial<TRow>, options?: RequestOptions) => {
          const body = normalizeInput(input)
          const res = await request<Single<TRow>>(httpConfig, 'POST', `/${enc}/add`, { body, options })
          return normalizeSingleResult<TRow>(verifySchemaFingerprint(httpConfig, res), seed as string)
        },
        update: async (id: string, input: Partial<TRow>, options?: RequestOptions) => {
          const body = normalizeInput(input)
          const res = await request<Single<TRow>>(httpConfig, 'PUT', `/${enc}/edit/${encodeURIComponent(id)}`, { body, options })
          return normalizeSingleResult<TRow>(verifySchemaFingerprint(httpConfig, res), seed as string)
        },
      })
    },
  }
}

/** Alias for createBeechServerClient */
export const createBeechClient = createBeechServerClient

