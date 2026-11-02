// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Sessione e trasporto per le API Beech: il client tipizzato (`./rpc`) chiama `apiFetch`.
 * - JWT: Authorization Bearer dal token in memoria, refresh single-flight su 401
 * - errori: ogni risposta non-2xx lancia `ApiError` (vedi ./http/api-error)
 */
import { apiErrorFromResponse } from './http/api-error'
import { createApiFetch } from './http/api-fetch'

const LOGIN_PATH = '/admin/login';

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

/** Same as `apiFetch` without the time budget: for downloads that may stream for minutes. */
export const apiFetchUnbounded: typeof fetch = buildFetch(0)

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
