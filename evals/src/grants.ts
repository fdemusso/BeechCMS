// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { createPkcePair, writeGrant } from '@beechcms/api-client'
import { OAUTH_SCOPES } from '@beechcms/core'
import { MCP_OAUTH_CLIENT_ID, MCP_OAUTH_SCOPE, SCRIPT_OAUTH_CLIENT_ID } from '../../packages/mcp/src/constants.ts'
import type { EvalWorld } from './stack.ts'
import type { EvalVariant } from './types.ts'

/** `@beechcms/mcp@1.2.0` requests this by default (its api-client `resolveApiConfig`). */
const V1_GRANT_SCOPE = 'schema:read schema:write'
/** Same expression as `CLI_OAUTH_SCOPE` (packages/cli/src/lib/control-plane.ts:L27); pinned by grants.test.ts. */
export const SCRIPT_GRANT_SCOPE: string = OAUTH_SCOPES.filter(scope => scope !== 'agent:approve').join(' ')

export interface GrantRequest { clientId: string; scope: string }
export const GRANTS_BY_VARIANT: Record<EvalVariant, readonly GrantRequest[]> = {
  v1: [{ clientId: MCP_OAUTH_CLIENT_ID, scope: V1_GRANT_SCOPE }],
  v2: [{ clientId: MCP_OAUTH_CLIENT_ID, scope: MCP_OAUTH_SCOPE }, { clientId: SCRIPT_OAUTH_CLIENT_ID, scope: SCRIPT_GRANT_SCOPE }],
}

/** Loopback port is matched loosely by the API; only the registered path matters. */
const LOOPBACK_ORIGIN = 'http://127.0.0.1:8977'

/** Registered callback of a seeded OAuth client (`0000_v040_base.sql`). */
export function redirectUriFor(clientId: string): string {
  if (clientId === MCP_OAUTH_CLIENT_ID) return `${LOOPBACK_ORIGIN}/oauth/callback`
  if (clientId === SCRIPT_OAUTH_CLIENT_ID) return `${LOOPBACK_ORIGIN}/callback`
  throw new Error(`no registered redirect URI for client '${clientId}'`)
}

interface ConsentResponse { redirectTo: string }
interface TokenResponse { access_token: string; refresh_token: string; scope: string; expires_in: number }

/**
 * Mints OAuth grants for the throwaway admin without a browser and stores them in a run-scoped
 * token cache. The eval world is throwaway and the harness is its only human; real users still
 * consent in the browser.
 *
 * @throws Error when `cacheFile` would land inside `~/.beechcms` or the API refuses a step.
 */
export async function mintGrants(world: EvalWorld, apiUrl: string, cacheFile: string, grants: readonly GrantRequest[]): Promise<void> {
  const realCacheDir = join(homedir(), '.beechcms')
  if (resolve(cacheFile).startsWith(realCacheDir)) throw new Error(`refusing to write grants under ${realCacheDir}`)

  const previousCache = process.env.BEECH_TOKEN_CACHE
  process.env.BEECH_TOKEN_CACHE = cacheFile
  try {
    for (const { clientId, scope } of grants) {
      const redirectUri = redirectUriFor(clientId)
      const pkce = await createPkcePair()
      const consent = await world.api.expect<ConsentResponse>('POST', '/oauth/authorize/consent', 200, {
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        scope,
        state: `eval-${clientId}`,
        code_challenge: pkce.challenge,
        code_challenge_method: 'S256',
        approved: true,
      })
      const code = new URL(consent.redirectTo).searchParams.get('code')
      if (!code) throw new Error(`consent for ${clientId} returned no code`)

      const response = await fetch(`${apiUrl}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, code_verifier: pkce.verifier }).toString(),
      })
      if (response.status !== 200) throw new Error(`token exchange for ${clientId} answered ${response.status}`)
      const token = await response.json() as TokenResponse
      writeGrant(apiUrl, clientId, {
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        scope: token.scope,
        expiresAt: Date.now() + token.expires_in * 1000,
      })
    }
  } finally {
    if (previousCache === undefined) delete process.env.BEECH_TOKEN_CACHE
    else process.env.BEECH_TOKEN_CACHE = previousCache
  }
}
