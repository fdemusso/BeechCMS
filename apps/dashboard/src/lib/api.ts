// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Client HTTP per le API Beech.
 * - base '/api': in dev il proxy Vite inoltra al Worker locale
 * - JWT: Authorization Bearer dal token in memoria, refresh single-flight su 401
 * - FormData: nessun Content-Type manuale, il browser imposta il boundary
 * - errori: ogni risposta non-2xx lancia `ApiError` (vedi ./http/api-error)
 */
import { apiErrorFromResponse } from './http/api-error'
import { createApiFetch } from './http/api-fetch'

const LOGIN_PATH = '/admin/login';
const API_BASE = '/api'

/** Decodifica il payload JWT: il backend (jose) emette base64url (-/_, no padding),
 *  atob() capisce solo base64 standard (+//) e lancia InvalidCharacterError altrimenti.
 *  Il risultato di atob() è una stringa di byte grezzi: va reinterpretata come UTF-8
 *  per non corrompere nomi/cognomi con caratteri multi-byte (es. emoji, accenti). */
export function decodeJwtPayload(token: string): unknown {
  const base64url = token.split('.')[1]
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + (4 - (base64.length % 4 || 4)) % 4, '=')
  const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes))
}

/** Risposta POST /auth/login */
export interface LoginResponse {
  token: string
  expiresIn: string
}

// In-memory access token — never touches localStorage
let _accessToken: string | null = null;

function getAccessToken(): string | null { return _accessToken }
export function setAccessToken(token: string): void { _accessToken = token }
export function clearAccessToken(): void { _accessToken = null }

let refreshPromise: Promise<string> | null = null;

/**
 * Esegue il refresh del token, assicurandosi che non ci siano chiamate parallele.
 * Ritorna una promise che risolve al nuovo access token.
 */
export async function refreshToken(): Promise<string> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      // Bare fetch: this call must not re-enter the 401 → refresh path of `apiFetch`.
      const response = await fetch('/auth/refresh', { method: 'POST', credentials: 'include' })
      if (!response.ok) throw await apiErrorFromResponse(response)
      const data = (await response.json()) as LoginResponse
      setAccessToken(data.token);
      return data.token;
    } catch (error) {
      clearAccessToken();
      throw error;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

function onSessionExpired(): void {
  if (!globalThis.location.pathname.startsWith(LOGIN_PATH)) {
    globalThis.location.replace(LOGIN_PATH);
  }
}

function buildFetch(timeoutMs?: number): typeof fetch {
  return createApiFetch({ getAccessToken, refreshAccessToken: refreshToken, onSessionExpired, timeoutMs })
}

/** Authenticated fetch for the whole API surface (`/api/*` and `/auth/*`), 30 s budget. */
export const apiFetch: typeof fetch = buildFetch()

type QueryValue = string | number | boolean | null | undefined

export interface RequestOptions {
  /** Flat scalars only: undefined/null are skipped, nested values must be stringified by the caller. */
  params?: object
  /** Request body for DELETE, which has no positional body argument. */
  data?: unknown
  headers?: Record<string, string | undefined>
  signal?: AbortSignal
  /** Overrides the '/api' prefix, e.g. '/' for the OAuth server which lives at '/oauth/*'. */
  baseURL?: string
  /** 'blob' for downloads; anything else is parsed as JSON. */
  responseType?: 'json' | 'blob'
  /** Request budget in ms. `0` disables it (long streaming downloads). Default 30 s. */
  timeout?: number
}

export interface ApiResponse<T> {
  data: T
}

function buildUrl(path: string, options: RequestOptions): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(options.params ?? {}) as [string, QueryValue][]) {
    if (value !== undefined && value !== null) query.set(key, String(value))
  }
  const search = query.toString()
  const base = (options.baseURL ?? API_BASE).replace(/\/$/, '')
  return `${base}${path}${search ? `?${search}` : ''}`
}

function encodeBody(body: unknown): { body?: BodyInit; contentType?: string } {
  if (body === undefined) return {}
  if (body instanceof FormData || body instanceof Blob || body instanceof URLSearchParams || typeof body === 'string') {
    return { body }
  }
  return { body: JSON.stringify(body), contentType: 'application/json' }
}

async function parseBody<T>(response: Response, responseType: RequestOptions['responseType']): Promise<T> {
  if (responseType === 'blob') return (await response.blob()) as T
  const text = await response.text()
  if (text === '') return undefined as T
  try {
    return JSON.parse(text) as T
  } catch {
    return text as T
  }
}

async function request<T>(
  method: string,
  path: string,
  body: unknown,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const encoded = encodeBody(body)
  const headers = new Headers()
  if (encoded.contentType) headers.set('Content-Type', encoded.contentType)
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    if (value !== undefined) headers.set(name, value)
  }

  const send = options.timeout === undefined ? apiFetch : buildFetch(options.timeout)
  const response = await send(buildUrl(path, options), {
    method,
    headers,
    body: encoded.body,
    signal: options.signal,
  })
  return { data: await parseBody<T>(response, options.responseType) }
}

/**
 * Axios-shaped facade over `apiFetch`, kept while features move to the typed `hc` client.
 * Same call shape (`api.get<T>(path, { params })` → `{ data }`), so unmigrated call sites and
 * their `vi.mock('@/lib/api')` tests are untouched.
 */
export const api = {
  get: <T = unknown>(path: string, options?: RequestOptions) => request<T>('GET', path, undefined, options),
  delete: <T = unknown>(path: string, options?: RequestOptions) => request<T>('DELETE', path, options?.data, options),
  post: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) => request<T>('POST', path, body, options),
  put: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PUT', path, body, options),
  patch: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PATCH', path, body, options),
}

export function isTokenValid(token: string | null): boolean {
  if (!token) return false
  try {
    const payload = decodeJwtPayload(token) as { exp?: unknown }
    return typeof payload.exp === 'number' && payload.exp > Date.now() / 1000
  } catch {
    return false
  }
}

/** Rimuove il token, invalida refresh token nel backend e reindirizza alla pagina di login */
export async function logout(): Promise<void> {
  if (globalThis.window !== undefined) {
    try {
      await fetch('/auth/logout', { method: 'POST', credentials: 'include' })
    } catch (err) {
      console.error('Logout error:', err);
    }

    clearAccessToken();
    globalThis.location.replace(LOGIN_PATH);
  }
}
