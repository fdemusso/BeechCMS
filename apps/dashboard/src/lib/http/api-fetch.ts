// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { apiErrorFromResponse } from './api-error'

type FetchInput = Parameters<typeof fetch>[0]
type FetchInit = NonNullable<Parameters<typeof fetch>[1]>

export interface ApiFetchOptions {
  /** The in-memory access token, or null when signed out. */
  getAccessToken: () => string | null
  /** Obtains a fresh access token. Must be single-flight and reject when the session is over. */
  refreshAccessToken: () => Promise<string>
  /** Called once the refresh failed, i.e. the user has to sign in again. */
  onSessionExpired: () => void
  /** Per-request budget in ms; 0 disables it (long streaming downloads). Default 30 s. */
  timeoutMs?: number
  /** Resolved per call, not captured, so a test can stub `globalThis.fetch` after import. */
  fetchImpl?: typeof fetch
}

const DEFAULT_TIMEOUT_MS = 30_000

// The refresh round-trip itself, and the login that has no session to refresh: a 401 from either
// is a verdict, not an expired access token.
const NO_REFRESH_PATHS = ['/auth/login', '/auth/refresh']

function requestPathname(input: FetchInput): string {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  try {
    return new URL(raw, 'http://localhost').pathname
  } catch {
    return raw
  }
}

function withTimeout(signal: AbortSignal | null | undefined, timeoutMs: number): AbortSignal | undefined {
  if (timeoutMs <= 0) return signal ?? undefined
  const timeout = AbortSignal.timeout(timeoutMs)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

/**
 * A `fetch` for the Beech API: attaches the Bearer token, always sends the refresh cookie, turns
 * every non-2xx into an `ApiError`, and on a 401 refreshes the token once and replays the request.
 *
 * It never sets Content-Type: `hc` and the facade set it for JSON, and a FormData body needs the
 * browser to add the multipart boundary itself.
 */
export function createApiFetch(options: ApiFetchOptions): typeof fetch {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  return async (input: FetchInput, init?: FetchInit): Promise<Response> => {
    const doFetch = options.fetchImpl ?? globalThis.fetch
    // A Request's body is single-use; keep a pristine copy for the replay after a refresh.
    const replayInput = input instanceof Request ? input.clone() : input

    const attempt = (target: FetchInput, token: string | null, replaceAuthorization: boolean) => {
      const headers = new Headers(init?.headers)
      if (token && (replaceAuthorization || !headers.has('Authorization'))) {
        headers.set('Authorization', `Bearer ${token}`)
      }
      return doFetch(target, {
        ...init,
        headers,
        credentials: 'include',
        signal: withTimeout(init?.signal, timeoutMs),
      })
    }

    let response = await attempt(input, options.getAccessToken(), false)

    const shouldRefresh =
      response.status === 401 &&
      globalThis.window !== undefined &&
      !NO_REFRESH_PATHS.some((path) => requestPathname(input).endsWith(path))

    if (shouldRefresh) {
      let freshToken: string
      try {
        freshToken = await options.refreshAccessToken()
      } catch (refreshError) {
        options.onSessionExpired()
        throw refreshError
      }
      response = await attempt(replayInput, freshToken, true)
    }

    if (!response.ok) throw await apiErrorFromResponse(response)
    return response
  }
}
