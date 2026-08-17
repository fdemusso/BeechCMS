// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { BeechClientConfig, BeechResult, ListQuery, ListMeta } from './types.js'
import { buildSearchParams } from './query-builder.js'
import { request } from './http.js'

export type Listable<TRow> = { data: TRow[]; meta: ListMeta }
export type Single<TRow>   = { data: TRow;   meta: { seed: string } }

export interface ContentResource<TRow> {
  list(query?: ListQuery<TRow>): Promise<BeechResult<Listable<TRow>>>
  get(selector: { id: string } | { slug: string }): Promise<BeechResult<Single<TRow>>>
  create(input: Partial<TRow>): Promise<BeechResult<Single<TRow>>>
  update(id: string, input: Partial<TRow>): Promise<BeechResult<Single<TRow>>>
}

export interface BeechClient<TRegistry> {
  content<K extends keyof TRegistry & string>(seed: K): ContentResource<TRegistry[K]>
}

export function createBeechClient<TRegistry = Record<string, unknown>>(
  config: BeechClientConfig,
): BeechClient<TRegistry> {
  return {
    content(seed) {
      type TRow = TRegistry[typeof seed]
      const enc = encodeURIComponent(seed)
      return {
        list: (q) =>
          request<Listable<TRow>>(config, 'GET', `/${enc}`, { params: buildSearchParams(q as ListQuery<Record<string, unknown>>) }),
        get: (sel) => {
          const p = new URLSearchParams('id' in sel ? { id: sel.id } : { slug: sel.slug })
          return request<Single<TRow>>(config, 'GET', `/${enc}`, { params: p })
        },
        create: (input) => request<Single<TRow>>(config, 'POST', `/${enc}/add`, { body: input }),
        update: (id, input) =>
          request<Single<TRow>>(config, 'PUT', `/${enc}/edit/${encodeURIComponent(id)}`, { body: input }),
      }
    },
  }
}
