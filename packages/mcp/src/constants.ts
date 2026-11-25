// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { OAuthScope } from '@beechcms/core'

export const MCP_SERVER_NAME = 'beechcms-mcp'
/** OAuth client of this server (`apps/api/migrations/0000_v040_base.sql`). The only client allowed `agent:approve`. */
export const MCP_OAUTH_CLIENT_ID = 'beech-mcp'
/** Client `beech run` uses (`packages/cli/src/lib/control-plane.ts`). Read only to report its cached scopes. */
export const SCRIPT_OAUTH_CLIENT_ID = 'beech-mcp-cli'
/** What the 2.0+ tools need: schema tools, whoami (`settings.me`), automations read, intents, approve. */
export const MCP_OAUTH_SCOPES = [
  'schema:read',
  'schema:write',
  'settings:read',
  'automations:read',
  'agent:read',
  'agent:approve',
] as const satisfies readonly OAuthScope[]
export const MCP_OAUTH_SCOPE: string = MCP_OAUTH_SCOPES.join(' ')
/** Scopes that trigger a one-time grant reset when missing from a cached grant (e.g. pre-2.0 or pre-automations grants). */
export const MCP_CONSENT_MARKER_SCOPES: readonly OAuthScope[] = ['agent:read', 'automations:read']
export const MCP_V2_MARKER_SCOPE: OAuthScope = 'agent:read'
/** Dashboard address of "Pending agent actions" (sprint 05b), relative to the auth origin. */
export const PENDING_ACTIONS_PATH = '/admin/?settings=connected-apps&section=agent-actions'

export const CONFIRM_MAX_INTENTS = 20
/** Equals the intent TTL (AGENT_INTENT_TTL_SECONDS = 600): waiting longer cannot succeed. */
export const CONFIRM_ELICIT_TIMEOUT_MS = 600_000
export const CONFIRM_BODY_PREVIEW_CHARS = 300
export const CONFIRM_RESULT_PREVIEW_CHARS = 2_000

export const SEARCH_DEFAULT_LIMIT = 10
export const SEARCH_MAX_LIMIT = 50
export const SEARCH_DOCS_LIMIT = 3

/** The one form the confirm dialog asks for. */
export const CONFIRM_DECISION_SCHEMA = {
  type: 'object',
  properties: {
    decision: {
      type: 'string',
      title: 'Decision',
      description: 'approve runs every action listed once; reject discards them all',
      enum: ['approve', 'reject'],
    },
  },
  required: ['decision'],
} as const
