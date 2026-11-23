// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module sdk/api-client-transport
 * Production transport: the OAuth-authenticated `@beechcms/api-client`. The only SDK file that may import it,
 * so the published `dist/sdk/*.d.ts` never mentions the private package.
 */

import { BeechClientError, createApiClient, resolveApiConfig } from '@beechcms/api-client'
import { CLI_CALLBACK_PATH, CLI_OAUTH_CLIENT_ID, CLI_OAUTH_SCOPE } from '../lib/control-plane.js'
import { BeechSdkError, SDK_ERROR_CODES } from './errors.js'
import type { SdkRequest, SdkTransport } from './types.js'

export function createApiClientTransport(options: { apiUrl?: string } = {}): SdkTransport & { readonly baseUrl: string } {
  const config = resolveApiConfig({
    baseUrl: options.apiUrl,
    clientId: CLI_OAUTH_CLIENT_ID,
    scope: CLI_OAUTH_SCOPE,
    callbackPath: CLI_CALLBACK_PATH,
  })
  const client = createApiClient(config)

  return {
    baseUrl: client.baseUrl,
    async send({ method, path, body, headers }: SdkRequest): Promise<Response> {
      try {
        return await client.send(method, path, body, headers)
      } catch (error) {
        if (error instanceof BeechClientError) {
          if (error.status === 401) throw new BeechSdkError(error.message, 401, SDK_ERROR_CODES.UNAUTHORIZED, '', null)
          if (error.status === undefined) throw new BeechSdkError(error.message, 0, SDK_ERROR_CODES.UNREACHABLE, '', null)
        }
        throw error
      }
    },
  }
}
