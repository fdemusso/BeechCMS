// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { TestApp } from '../harness'

export interface TestClient {
  request(path: string, init?: RequestInit): Promise<Response>
  get(path: string, init?: RequestInit): Promise<Response>
  post(path: string, body?: unknown, init?: RequestInit): Promise<Response>
  put(path: string, body?: unknown, init?: RequestInit): Promise<Response>
  patch(path: string, body?: unknown, init?: RequestInit): Promise<Response>
  delete(path: string, init?: RequestInit): Promise<Response>
  /** Returns a client carrying the extra headers on top of this one's. */
  withHeaders(headers: Record<string, string>): TestClient
}

export function createTestClient(
  app: TestApp,
  env: Record<string, unknown>,
  baseHeaders: Record<string, string>,
): TestClient {
  const send = async (path: string, init: RequestInit = {}): Promise<Response> =>
    app.request(path, { ...init, headers: { ...baseHeaders, ...(init.headers as Record<string, string>) } }, env)

  const withBody = (method: string) => (path: string, body?: unknown, init: RequestInit = {}) =>
    send(path, {
      ...init,
      method,
      headers: { 'Content-Type': 'application/json', ...(init.headers as Record<string, string>) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })

  return {
    request: send,
    get: (path, init) => send(path, { ...init, method: 'GET' }),
    post: withBody('POST'),
    put: withBody('PUT'),
    patch: withBody('PATCH'),
    delete: (path, init) => send(path, { ...init, method: 'DELETE' }),
    withHeaders: (headers) => createTestClient(app, env, { ...baseHeaders, ...headers }),
  }
}
