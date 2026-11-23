// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * Declarations of all Model Context Protocol (MCP) tools supported by BeechCMS.
 *
 * @module
 */

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const
const ADDITIVE_WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const
/** `beech_confirm` runs approved intents, which may delete data. */
const CONFIRM = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false } as const

export const TOOLS = [
  {
    name: 'beech_list_seeds',
    annotations: READ_ONLY,
    description: 'List all BeechCMS seed schemas (summaries only) plus the current schema version. Start here for any schema task — bundled beechcms-docs:// MCP resources (API reference, field types, branch policies) are also available via resources/list and are worth checking before proposing a candidate.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'beech_get_seed',
    annotations: READ_ONLY,
    description: 'Fetch the full definition of a single seed by slug.',
    inputSchema: {
      type: 'object',
      properties: { slug: { type: 'string' } },
      required: ['slug'],
      additionalProperties: false,
    },
  },
  {
    name: 'beech_schema_export',
    annotations: READ_ONLY,
    description: 'Export the full BeechCMS schema registry snapshot (definitions + layouts).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'beech_schema_validate',
    annotations: READ_ONLY,
    description: 'Validate a candidate seed definition against the full active seed set (zero-latency, no D1 write).',
    inputSchema: {
      type: 'object',
      properties: { candidate: { type: 'object' } },
      required: ['candidate'],
      additionalProperties: false,
    },
  },
  {
    name: 'beech_schema_plan',
    annotations: READ_ONLY,
    description: 'Server-computes the exact DDL and safety classification for a candidate seed change. Always call before beech_schema_apply. Destructive changes (dropping/renaming/retyping a branch, deleting a seed) are classified but never applicable via MCP — those require the BeechCMS dashboard UI. A definition-only change (tag options, option colors, multiple) produces no DDL: it is reported as definitionChanged: true with the affected aliases in changedBranches, and beech_schema_apply persists it. definitionChanged: false means applying changes nothing. Unsure about a field type or branch policy? Check the beechcms-docs:// resources before building the candidate.',
    inputSchema: {
      type: 'object',
      properties: { slug: { type: 'string' }, candidate: { type: 'object' } },
      required: ['slug', 'candidate'],
      additionalProperties: false,
    },
  },
  {
    name: 'beech_schema_apply',
    annotations: ADDITIVE_WRITE,
    description: 'Atomically applies a previously planned, additive-only schema change. Requires a planId from beech_schema_plan. Refuses any destructive classification (drop/rename/retype branch, delete seed) — use the BeechCMS dashboard UI for those instead.',
    inputSchema: {
      type: 'object',
      properties: { planId: { type: 'string' } },
      required: ['planId'],
      additionalProperties: false,
    },
  },
  {
    name: 'beech_docs_search',
    annotations: READ_ONLY,
    description: 'Full-text search over the bundled beechcms-docs:// resources (API reference, field types, branch policies, guides). Use this before proposing a candidate when unsure about a field type, policy, or workflow — cheaper than listing all resources and guessing a URI.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number', description: 'Max results to return. Defaults to 10.' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'beech_mcp_status',
    annotations: READ_ONLY,
    description: 'Inspect the active MCP server process, bundle SHA-256 hash, and bundled resource count.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'beech_mcp_reload',
    annotations: READ_ONLY,
    description: 'Forces an immediate in-memory cache refresh of bundled resources and broadcasts list_changed notifications to the MCP client without requiring a manual /mcp reconnect.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'beech_whoami',
    annotations: READ_ONLY,
    description: 'Who the agent acts as: user, RBAC permissions per seed, the scopes of this server and of beech run scripts, ENV and which risks need human approval, schema version. Call once at the start of a task.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'beech_search',
    annotations: READ_ONLY,
    description: 'Search the BeechCMS operation catalog and docs. Returns operation id, SDK method (beech.<id>), HTTP route, scope, risk and approval rule, plus matching beechcms-docs:// resources. Use it to write .beech/scripts/*.ts instead of guessing endpoints.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        detail: { type: 'string', enum: ['name', 'signature', 'full'], description: 'Defaults to signature.' },
        limit: { type: 'number', description: 'Max operations to return. Defaults to 10, max 50.' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'beech_intents',
    annotations: READ_ONLY,
    description: 'List your pending agent intents: actions a script or agent requested that wait for human approval.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'beech_confirm',
    annotations: CONFIRM,
    description: "Ask the human to approve or reject pending intents in one dialog. Approved intents run once on the server with the human's permissions. If the dialog is declined or unavailable nothing runs: relay the returned instruction to the human.",
    inputSchema: {
      type: 'object',
      properties: { intentIds: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 20 } },
      required: ['intentIds'],
      additionalProperties: false,
    },
  },
]
