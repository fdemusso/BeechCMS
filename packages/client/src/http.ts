// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type {
  BeechBrowserClientConfig,
  BeechClientBaseConfig,
  BeechProblem,
  BeechResult,
  BeechServerClientConfig,
  RequestOptions,
} from './types.js'

const SECRET_KEY_PREFIX = 'beech_sk_'

/** Transport settings after validation; `key` is the one the client's role requires. Internal: not re-exported from index. */
export interface HttpConfig extends BeechClientBaseConfig {
  key: string
}

function resolveConfig(
  config: BeechClientBaseConfig & Record<string, unknown>,
  keyName: 'publishableKey' | 'secretKey',
  factoryName: string,
): HttpConfig {
  if (!config || typeof config !== 'object') {
    throw new TypeError('Configuration object is required')
  }
  if (!config.baseUrl || typeof config.baseUrl !== 'string' || !config.baseUrl.trim()) {
    throw new Error('baseUrl is required and must be a non-empty string')
  }
  if (Object.hasOwn(config, 'apiKey')) {
    throw new Error(`apiKey was removed: pass ${keyName} to ${factoryName}`)
  }
  const key = config[keyName]
  if (!key || typeof key !== 'string' || !key.trim()) {
    throw new Error(`${keyName} is required and must be a non-empty string`)
  }
  return { baseUrl: config.baseUrl, fetch: config.fetch, headers: config.headers, schemaFingerprint: config.schemaFingerprint, key }
}

export function resolveBrowserConfig(config: BeechBrowserClientConfig): HttpConfig {
  const resolved = resolveConfig(config as unknown as BeechClientBaseConfig & Record<string, unknown>, 'publishableKey', 'createBeechBrowserClient')
  if (resolved.key.startsWith(SECRET_KEY_PREFIX)) {
    throw new Error('publishableKey is a secret key (beech_sk_…): secret keys must never reach the browser. Use the publishable key (beech_pk_…).')
  }
  return resolved
}

export function resolveServerConfig(config: BeechServerClientConfig): HttpConfig {
  return resolveConfig(config as unknown as BeechClientBaseConfig & Record<string, unknown>, 'secretKey', 'createBeechServerClient')
}

export async function request<T>(
  cfg: HttpConfig,
  method: string,
  path: string,
  opts: { params?: URLSearchParams; body?: unknown; options?: RequestOptions } = {},
): Promise<BeechResult<T>> {
  const doFetch = cfg.fetch ?? fetch
  const base = cfg.baseUrl.replace(/\/+$/, '')
  const qs = opts.params && opts.params.size ? `?${opts.params}` : ''
  const url = `${base}/api/v1/public${path}${qs}`

  const headers = new Headers(cfg.headers)
  headers.set('X-API-Key', cfg.key)

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
    return { data: null, error: normalizeProblem(res.status, payload, res.statusText), headers: res.headers }
  }

  if (res.status === 204) {
    return { data: null as T, error: null, headers: res.headers }
  }

  // Non-JSON, unparseable or `null` body on a 2xx: answering { data: null, error: null } would break the union.
  if (payload === null) {
    return { data: null, error: invalidResponseProblem(res.status, ct, url), headers: res.headers }
  }

  return { data: payload as T, error: null, headers: res.headers }
}

function invalidResponseProblem(status: number, contentType: string, url: string): BeechProblem {
  return {
    type: 'invalid-response',
    title: 'Invalid Response',
    status,
    detail: `Expected a JSON body from ${url}, got ${contentType || 'no Content-Type'}. ` +
      'Check that baseUrl is the BeechCMS API origin, not the dashboard (/admin) or a site that answers every path with HTML.',
  }
}

/** Off when no fingerprint is configured: an unset value must not flag every response as drift. */
export function verifySchemaFingerprint<T>(cfg: HttpConfig, res: BeechResult<T>): BeechResult<T> {
  const revision = res.headers?.get('X-Schema-Revision')
  if (cfg.schemaFingerprint && revision && revision !== cfg.schemaFingerprint) {
    return {
      data: null,
      error: { type: 'schema_drift', title: 'Stale Types', status: 409, detail: 'Client types stale, regenerate with `beech types generate`' },
      headers: res.headers,
    }
  }
  return res
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
