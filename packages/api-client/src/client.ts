// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * Authenticated HTTP client for the BeechCMS REST API.
 *
 * OAuth 2.1 authorization-code + PKCE, an on-disk grant cache shared with every other Beech tool, and
 * refresh-and-retry on 401. One instance owns one grant: the browser flow is guarded per instance so
 * two concurrent calls never open two consent windows.
 *
 * @module
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { authorize, refresh, type OAuthConfig } from './oauth.js'
import { BeechClientError, type ProblemDetails } from './errors.js'
import { type CachedGrant, clearGrant, readGrant, writeGrant } from './token-store.js'

/** Seconds of clock skew treated as "already expired", so a token that dies in flight is refreshed
 *  before the request rather than after a 401. */
const EXPIRY_SKEW_MS = 30_000
const MAX_TRANSIENT_RETRIES = 2
const RETRY_BASE_DELAY_MS = 100

export interface ApiResponse<T> {
  data: T
  headers: Headers
}

export interface ApiClient {
  request<T = unknown>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>>
  readonly baseUrl: string
}

export interface ApiClientConfig {
  baseUrl: string
  oauth: OAuthConfig
}

/** Overrides a caller may set; anything omitted falls back to env, `.dev.vars`, then the default. */
export interface ApiConfigOverrides {
  baseUrl?: string
  clientId?: string
  scope?: string
  callbackPath?: string
}

function readDevVarsApiUrl(): string | undefined {
  const devVarsPath = join(process.cwd(), '.dev.vars')
  if (!existsSync(devVarsPath)) return undefined
  const match = readFileSync(devVarsPath, 'utf8').match(/^BEECH_API_URL=(.*)$/m)
  return match ? match[1].trim() : undefined
}

/** Resolves connection + OAuth configuration from overrides, environment, `.dev.vars`, defaults. */
export function resolveApiConfig(overrides: ApiConfigOverrides = {}): ApiClientConfig {
  const baseUrl = overrides.baseUrl ?? process.env.BEECH_API_URL ?? readDevVarsApiUrl() ?? 'http://localhost:8789'
  return {
    baseUrl,
    oauth: {
      apiUrl: baseUrl,
      authUrl: process.env.BEECH_AUTH_URL ?? baseUrl,
      clientId: overrides.clientId ?? process.env.BEECH_OAUTH_CLIENT_ID ?? 'beech-mcp',
      scope: overrides.scope ?? process.env.BEECH_OAUTH_SCOPE ?? 'schema:read schema:write',
      timeoutMs: process.env.BEECH_OAUTH_TIMEOUT_MS ? Number(process.env.BEECH_OAUTH_TIMEOUT_MS) : 180_000,
      callbackPath: overrides.callbackPath,
    },
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function createApiClient(config: ApiClientConfig): ApiClient {
  let grant: CachedGrant | undefined
  let inFlightAuth: Promise<CachedGrant> | undefined

  async function getAccessToken(forceRefresh = false): Promise<string> {
    if (grant === undefined) grant = readGrant(config.baseUrl, config.oauth.clientId)
    if (grant && !forceRefresh && grant.expiresAt - Date.now() > EXPIRY_SKEW_MS) return grant.accessToken
    if (inFlightAuth) return (await inFlightAuth).accessToken

    const authPromise = (async () => {
      if (grant?.refreshToken) {
        try {
          const refreshed = await refresh(config.oauth, grant.refreshToken)
          writeGrant(config.baseUrl, config.oauth.clientId, refreshed)
          grant = refreshed
          return refreshed
        } catch {
          clearGrant(config.baseUrl, config.oauth.clientId)
          grant = undefined
        }
      }
      const authorized = await authorize(config.oauth)
      writeGrant(config.baseUrl, config.oauth.clientId, authorized)
      grant = authorized
      return authorized
    })()

    inFlightAuth = authPromise
    try {
      return (await authPromise).accessToken
    } finally {
      inFlightAuth = undefined
    }
  }

  async function rawFetch(method: string, path: string, accessToken: string, body?: unknown): Promise<Response> {
    try {
      return await fetch(`${config.baseUrl}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
    } catch (error) {
      if (error instanceof TypeError || (error as NodeJS.ErrnoException)?.code === 'ECONNREFUSED') {
        throw new BeechClientError(`Cannot reach the BeechCMS API at ${config.baseUrl}. Start the local stack with: pnpm beech dev`)
      }
      throw error
    }
  }

  async function request<T = unknown>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
    let accessToken = await getAccessToken()
    let response = await rawFetch(method, path, accessToken, body)

    if (response.status === 401) {
      accessToken = await getAccessToken(true)
      response = await rawFetch(method, path, accessToken, body)
      if (response.status === 401) {
        throw new BeechClientError(
          'Authorization failed. Run any Beech tool again to re-authorize in the browser, or revoke and re-grant the client from Settings → Connected apps.',
          401,
        )
      }
    }

    for (let attempt = 0; isRetryableStatus(response.status) && attempt < MAX_TRANSIENT_RETRIES; attempt++) {
      await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt + Math.random() * RETRY_BASE_DELAY_MS)
      response = await rawFetch(method, path, accessToken, body)
    }

    if (response.status === 403) {
      let errorBody: { error?: string; error_description?: string } = {}
      try { errorBody = (await response.json()) as typeof errorBody } catch { /* non-JSON error body */ }
      if (errorBody.error === 'insufficient_scope') {
        const scope = errorBody.error_description?.match(/'([^']+)'/)?.[1] ?? ''
        throw new BeechClientError(
          `Token lacks the '${scope}' scope. Revoke 'BeechCMS MCP Server' under Settings → Connected apps and re-authorize.`,
          403,
        )
      }
      throw new BeechClientError(
        JSON.stringify({ status: 403, title: errorBody.error ?? response.statusText, detail: errorBody.error_description ?? '' }),
        403,
      )
    }

    if (!response.ok) {
      let problem: Partial<ProblemDetails> = {}
      try { problem = (await response.json()) as Partial<ProblemDetails> } catch { /* non-JSON error body */ }
      throw new BeechClientError(
        JSON.stringify({ status: problem.status ?? response.status, title: problem.title ?? response.statusText, detail: problem.detail ?? '' }),
        problem.status ?? response.status,
        problem,
      )
    }

    return { data: (await response.json()) as T, headers: response.headers }
  }

  return { request, baseUrl: config.baseUrl }
}
