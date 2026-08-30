// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { BeechClientConfig, BeechProblem, BeechResult, RequestOptions } from './types.js'

export function validateClientConfig(config: BeechClientConfig): void {
  if (!config || typeof config !== 'object') {
    throw new TypeError('Configuration object is required')
  }
  if (!config.baseUrl || typeof config.baseUrl !== 'string' || !config.baseUrl.trim()) {
    throw new Error('baseUrl is required and must be a non-empty string')
  }
  if (!config.apiKey || typeof config.apiKey !== 'string' || !config.apiKey.trim()) {
    throw new Error('apiKey is required and must be a non-empty string')
  }
}

export async function request<T>(
  cfg: BeechClientConfig,
  method: string,
  path: string,
  opts: { params?: URLSearchParams; body?: unknown; options?: RequestOptions } = {},
): Promise<BeechResult<T>> {
  const doFetch = cfg.fetch ?? fetch
  const base = cfg.baseUrl.replace(/\/+$/, '')
  const qs = opts.params && opts.params.size ? `?${opts.params}` : ''
  const url = `${base}/api/v1/public${path}${qs}`

  const headers = new Headers(cfg.headers)
  headers.set('X-API-Key', cfg.apiKey)

  if (opts.body !== undefined) {
    headers.set('Content-Type', 'application/json')
  }

  if (opts.options?.headers) {
    const extraHeaders = new Headers(opts.options.headers)
    extraHeaders.forEach((val, key) => headers.set(key, val))
  }

  const { headers: _, ...forwardOptions } = opts.options ?? {}

  let res: Response
  try {
    res = await doFetch(url, {
      ...forwardOptions,
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    } as RequestInit)
  } catch (e) {
    return { data: null, error: networkProblem(e) }
  }

  const ct = res.headers.get('Content-Type') ?? ''
  const payload = ct.includes('json') ? await res.json().catch(() => null) : null

  if (!res.ok) {
    return { data: null, error: normalizeProblem(res.status, payload, res.statusText) }
  }

  return { data: payload as T, error: null }
}

function networkProblem(e: unknown): BeechProblem {
  return {
    type: 'about:blank',
    title: 'Network Error',
    status: 0,
    detail: e instanceof Error ? e.message : 'fetch failed',
  }
}

function normalizeProblem(status: number, payload: unknown, statusText?: string): BeechProblem {
  if (payload && typeof payload === 'object') {
    const p = payload as Record<string, unknown>
    return {
      type: typeof p.type === 'string' ? p.type : 'about:blank',
      title: typeof p.title === 'string' ? p.title : (statusText || 'HTTP Error'),
      status: typeof p.status === 'number' ? p.status : status,
      detail: typeof p.detail === 'string' ? p.detail : `Request failed with status ${status}`,
      ...(typeof p.instance === 'string' ? { instance: p.instance } : {}),
      ...(Array.isArray(p.errors) ? { errors: p.errors as BeechProblem['errors'] } : {}),
    }
  }

  return {
    type: 'about:blank',
    title: statusText || 'HTTP Error',
    status,
    detail: typeof payload === 'string' && payload.trim() ? payload : `Request failed with status ${status}`,
  }
}
