// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { BeechClientConfig, BeechResult, BeechServerClient, Listable, ListQuery, Single } from '../types.js'
import { buildSearchParams } from '../query-builder.js'
import { request, validateClientConfig } from '../http.js'

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
  config: BeechClientConfig,
): BeechServerClient<TRegistry> {
  validateClientConfig(config)

  return {
    content(seed) {
      type TRow = TRegistry[typeof seed]
      const enc = encodeURIComponent(seed)
      return {
        list: (q, options) =>
          request<Listable<TRow>>(config, 'GET', `/${enc}`, {
            params: buildSearchParams(q as ListQuery<Record<string, unknown>>),
            options,
          }),
        get: (sel, options) => {
          const p = new URLSearchParams('id' in sel ? { id: sel.id } : { slug: sel.slug })
          return request<Single<TRow>>(config, 'GET', `/${enc}`, { params: p, options })
        },
        create: async (input, options) => {
          const body = normalizeInput(input)
          const res = await request<Single<TRow>>(config, 'POST', `/${enc}/add`, { body, options })
          return normalizeSingleResult<TRow>(res, seed)
        },
        update: async (id, input, options) => {
          const body = normalizeInput(input)
          const res = await request<Single<TRow>>(config, 'PUT', `/${enc}/edit/${encodeURIComponent(id)}`, { body, options })
          return normalizeSingleResult<TRow>(res, seed)
        },
      }
    },
  }
}

/** Alias for createBeechServerClient */
export const createBeechClient = createBeechServerClient

