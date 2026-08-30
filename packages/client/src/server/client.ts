// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { BeechClientConfig, BeechServerClient, Listable, ListQuery, Single } from '../types.js'
import { buildSearchParams } from '../query-builder.js'
import { request, validateClientConfig } from '../http.js'

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
        create: (input, options) =>
          request<Single<TRow>>(config, 'POST', `/${enc}/add`, { body: input, options }),
        update: (id, input, options) =>
          request<Single<TRow>>(config, 'PUT', `/${enc}/edit/${encodeURIComponent(id)}`, { body: input, options }),
      }
    },
  }
}

/** Alias for createBeechServerClient */
export const createBeechClient = createBeechServerClient
