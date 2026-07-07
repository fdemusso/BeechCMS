// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { BeechClientConfig, BeechProblem, BeechResult } from './types.js'

export async function request<T>(
  cfg: BeechClientConfig,
  method: string,
  path: string,
  opts: { params?: URLSearchParams; body?: unknown } = {},
): Promise<BeechResult<T>> {
  const doFetch = cfg.fetch ?? fetch
  const base = cfg.baseUrl.replace(/\/+$/, '')
  const qs = opts.params && opts.params.size ? `?${opts.params}` : ''
  const url = `${base}/api/v1/public${path}${qs}`

  let res: Response
  try {
    res = await doFetch(url, {
      method,
      headers: {
        'X-API-Key': cfg.apiKey,
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    })
  } catch (e) {
    return { data: null, error: networkProblem(e) }
  }

  const ct = res.headers.get('Content-Type') ?? ''
  const payload = ct.includes('json') ? await res.json().catch(() => null) : null

  if (!res.ok) {
    return { data: null, error: (payload ?? fallbackProblem(res.status)) as BeechProblem }
  }
  return { data: payload as T, error: null }
}

function networkProblem(e: unknown): BeechProblem {
  return { type: 'about:blank', title: 'Network Error', status: 0,
    detail: e instanceof Error ? e.message : 'fetch failed' }
}

function fallbackProblem(status: number): BeechProblem {
  return { type: 'about:blank', title: 'HTTP Error', status, detail: `Request failed with status ${status}` }
}
