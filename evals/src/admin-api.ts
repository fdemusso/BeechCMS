// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

export interface ApiResult<T> { status: number; body: T }

export interface AdminApi {
  readonly baseUrl: string
  get<T>(path: string): Promise<ApiResult<T>>
  post<T>(path: string, body: unknown): Promise<ApiResult<T>>
  delete<T>(path: string): Promise<ApiResult<T>>
  /** Like post/get, but throws EvalSetupError unless status === expected. */
  expect<T>(method: 'GET' | 'POST' | 'DELETE', path: string, expected: number, body?: unknown): Promise<T>
}

export class EvalSetupError extends Error {}

/**
 * JWT fetch client for setup and checks. The dashboard-JWT path never meets the agent intent gate,
 * so the harness's own calls never create intents.
 */
export function createAdminApi(baseUrl: string, token: string): AdminApi {
  async function send<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const text = await response.text()
    let parsed: unknown = null
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = null
    }
    return { status: response.status, body: parsed as T }
  }

  return {
    baseUrl,
    get: path => send('GET', path),
    post: (path, body) => send('POST', path, body),
    delete: path => send('DELETE', path),
    async expect<T>(method: 'GET' | 'POST' | 'DELETE', path: string, expected: number, body?: unknown): Promise<T> {
      const result = await send<T>(method, path, body)
      if (result.status !== expected) {
        throw new EvalSetupError(`${method} ${path}: expected ${expected}, got ${result.status} ${JSON.stringify(result.body)}`)
      }
      return result.body
    },
  }
}
