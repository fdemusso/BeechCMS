// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { BeechBrowserClient, BeechClientConfig, Listable, ListQuery, Single } from '../types.js'
import { buildSearchParams } from '../query-builder.js'
import { request, validateClientConfig } from '../http.js'

export function createBeechBrowserClient<TRegistry = Record<string, unknown>>(
  config: BeechClientConfig,
): BeechBrowserClient<TRegistry> {
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
      }
    },
  }
}

/** Alias for createBeechBrowserClient */
export const createBeechClient = createBeechBrowserClient
