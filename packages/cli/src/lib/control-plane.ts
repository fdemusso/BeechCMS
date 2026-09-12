// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module lib/control-plane
 * The CLI's client for the seeds control plane (`POST /api/seeds/:slug/mcp-plan` / `mcp-apply`).
 *
 * Schema mutation from the CLI travels this module and nothing else: no SQL is built here, no D1
 * handle is opened, and no DDL is executed locally. The server plans through `@beechcms/core` and
 * commits through `D1SeedRepository.applyAtomic`; this module carries a candidate there and brings
 * the verdict back.
 */

import type { Seed } from '@beechcms/core'
import { createApiClient, resolveApiConfig, BeechClientError, type ApiClient } from '@beechcms/api-client'
import { CliError } from './d1-context.js'

/** OAuth client seeded for the CLI in `apps/api/migrations/0000_v040_base.sql`. Distinct from the MCP
 *  server's `beech-mcp` row so a grant can be revoked per tool in Settings → Connected apps. */
export const CLI_OAUTH_CLIENT_ID = 'beech-mcp-cli'

/** Registered redirect pathname for {@link CLI_OAUTH_CLIENT_ID}; the port is matched loosely. */
const CLI_CALLBACK_PATH = '/callback'

/** Verbatim response of `POST /api/seeds/:slug/mcp-plan`. */
export interface McpPlan {
  slug: string
  classification: 'create' | 'additive' | 'destructive'
  requiresConfirmation: boolean
  applicable: boolean
  /** Non-empty ⇒ apply will refuse. Each entry names the endpoint that CAN perform the change. */
  blockedReasons: string[]
  /** Exactly the DDL apply will run. Displayed, never parsed. */
  statements: string[]
  ftsRebuildNeeded: boolean
  expectedVersion: number
  issues: Array<{ fatal: boolean; messages: string[] }>
  /** Current owner, or null when the seed does not exist yet. Added by sprint 3b. */
  source: 'code' | 'runtime' | null
}

/** Verbatim response of `POST /api/seeds/:slug/mcp-apply`. */
export interface McpApplyResult {
  slug: string
  newVersion: number
  ftsRebuilt: boolean
  warning?: string
}

export interface ControlPlaneOptions {
  /** API origin. Default: `BEECH_API_URL`, then `.dev.vars`, then `http://localhost:8789`. */
  apiUrl?: string
}

export interface ControlPlane {
  plan(slug: string, candidate: Seed): Promise<McpPlan>
  apply(input: { slug: string; candidate: Seed; expectedVersion: number; planId: string }): Promise<McpApplyResult>
  readonly baseUrl: string
}

/** Maps a transport failure onto the CliError idiom, attaching the remedy the operator needs. */
function toCliError(error: unknown, slug: string): CliError {
  if (!(error instanceof BeechClientError)) {
    return new CliError(error instanceof Error ? error.message : String(error), undefined, error)
  }
  const detail = error.problem?.detail ?? error.message
  if (error.status === 401 || error.status === 403) {
    return new CliError(`Not authorized to change schema (${slug}).`, error.message, error)
  }
  if (error.status === 409) {
    return new CliError(
      `The schema registry moved while '${slug}' was being applied. Nothing was written.`,
      'Re-run `beech schema plan` and apply again.',
      error,
    )
  }
  if (error.status === 422) {
    return new CliError(`Server refused the change to '${slug}': ${detail}`, undefined, error)
  }
  return new CliError(`Control plane request failed for '${slug}': ${detail}`, undefined, error)
}

export function createControlPlane(options: ControlPlaneOptions = {}): ControlPlane {
  const config = resolveApiConfig({
    baseUrl: options.apiUrl,
    clientId: CLI_OAUTH_CLIENT_ID,
    scope: 'schema:read schema:write',
    callbackPath: CLI_CALLBACK_PATH,
  })
  const client: ApiClient = createApiClient(config)

  return {
    baseUrl: config.baseUrl,

    async plan(slug, candidate) {
      try {
        const { data } = await client.request<McpPlan>('POST', `/api/seeds/${slug}/mcp-plan`, { candidate })
        return data
      } catch (error) {
        throw toCliError(error, slug)
      }
    },

    async apply({ slug, candidate, expectedVersion, planId }) {
      try {
        // `source: 'code'` is written ONLY when the row is created: UPSERT_SEED_SQL's
        // ON CONFLICT clause deliberately omits `source`, so applying a manifest over a
        // dashboard-created seed never seizes ownership (ROADMAP standing decision).
        const { data } = await client.request<McpApplyResult>('POST', `/api/seeds/${slug}/mcp-apply`, {
          candidate,
          expectedVersion,
          planId,
          source: 'code',
        })
        return data
      } catch (error) {
        throw toCliError(error, slug)
      }
    },
  }
}
