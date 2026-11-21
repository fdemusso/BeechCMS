#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * Model Context Protocol (MCP) server for BeechCMS.
 *
 * @remarks
 * Exposes MCP tools over standard I/O (`stdio`) allowing AI agents to:
 * - List registered seed schemas (`beech_list_seeds`)
 * - Inspect full seed schema definitions (`beech_get_seed`)
 * - Export the active schema registry snapshot (`beech_schema_export`)
 * - Pre-validate proposed seed definitions in memory (`beech_schema_validate`)
 * - Generate migration plans with DDL and safety classifications (`beech_schema_plan`)
 * - Safely apply additive migration plans with optimistic concurrency (`beech_schema_apply`)
 * - Report the agent session (`beech_whoami`), search the operation catalog (`beech_search`)
 * - List and decide pending agent intents through one human dialog (`beech_intents`, `beech_confirm`)
 *
 * @module
 */

import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import type { Seed } from '@beechcms/core'
import { resolveCandidateIds, validateSeedDefinitions } from '@beechcms/core'
import { request, send, apiUrls, scriptGrantScopes, BeechClientError } from './client.js'
import {
  AgentToolError,
  beechConfirm,
  beechIntents,
  beechWhoami,
  type AgentToolDeps,
  type ElicitOutcome,
} from './agent-tools.js'
import { searchOperations, type SearchDetail } from './catalog-search.js'
import {
  CONFIRM_DECISION_SCHEMA,
  CONFIRM_ELICIT_TIMEOUT_MS,
  MCP_SERVER_NAME,
  SEARCH_DEFAULT_LIMIT,
  SEARCH_DOCS_LIMIT,
  SEARCH_MAX_LIMIT,
} from './constants.js'
import { TOOLS } from './tool-definitions.js'
import { MCP_SERVER_VERSION } from './version.js'
import { savePlan, takePlan } from './plans.js'
import { listResources, readResource, clearResourceCache, getResourceCount, searchResources } from './resources.js'
import { computeBundleHash, startSupervisorStdio } from './supervisor.js'

/**
 * Lightweight summary of a BeechCMS seed schema.
 */
interface SeedSummary {
  /** Unique URL-safe identifier of the seed schema. */
  slug: string
  /** Human-readable display label for the seed schema. */
  label: string
  /** Lifecycle status of the seed schema. */
  status: 'active' | 'deleted'
  /** Total number of fields (branches) defined on this seed schema. */
  branchCount: number
  /** Timestamp in milliseconds when the seed schema was last updated. */
  updatedAt: number
}

/**
 * Full seed schema record returned by the BeechCMS API.
 */
interface SeedRecord {
  /** Unique URL-safe identifier of the seed schema. */
  slug: string
  /** Complete seed schema definition including all branch configurations. */
  definition: Seed
  /** Lifecycle status of the seed schema record. */
  status: 'active' | 'deleted'
  /** Origin of the seed definition: `'code'` (codebase/migration defined) or `'runtime'` (API/UI defined). */
  source: 'code' | 'runtime'
  /** Timestamp in milliseconds when the seed record was created. */
  createdAt: number
  /** Timestamp in milliseconds when the seed record was last modified. */
  updatedAt: number
}

/**
 * Server-computed response for an MCP schema migration plan dry-run.
 */
interface McpPlanResponse {
  /** Target seed schema slug. */
  slug: string
  /** Safety classification computed by the Botanical Engine: `'create'`, `'additive'`, or `'destructive'`. */
  classification: 'create' | 'additive' | 'destructive'
  /** Indicates whether applying this plan requires explicit manual confirmation. */
  requiresConfirmation: boolean
  /** Indicates whether the plan can be applied programmatically. */
  applicable: boolean
  /** List of reasons why the plan is blocked from execution, if any. */
  blockedReasons: string[]
  /** Array of raw SQL DDL statements that will be run against D1 SQLite. */
  statements: string[]
  /** False ⇒ the stored definition already equals the candidate: applying it changes nothing. */
  definitionChanged: boolean
  /** Aliases of branches that are new or whose definition differs from the stored one (no DDL needed for most). */
  changedBranches: string[]
  /** Whether the full-text search (FTS) virtual table index must be rebuilt. */
  ftsRebuildNeeded: boolean
  /** The schema version expected at the time the plan was calculated, for concurrency validation. */
  expectedVersion: number
  /** Any schema validation or compatibility issues identified during planning. */
  issues: { fatal: boolean; messages: string[] }[]
}

const SEARCH_DETAILS: readonly SearchDetail[] = ['name', 'signature', 'full']

/** Mutable copy of the `as const` decision schema, as the SDK's request type requires. */
const DECISION_FORM_SCHEMA = {
  type: 'object' as const,
  properties: {
    decision: {
      ...CONFIRM_DECISION_SCHEMA.properties.decision,
      enum: [...CONFIRM_DECISION_SCHEMA.properties.decision.enum],
    },
  },
  required: [...CONFIRM_DECISION_SCHEMA.required],
}

/**
 * Adapts the server's elicitation to {@link ElicitOutcome}. Clients without form elicitation resolve `unsupported`;
 * other transport failures reject and become the `elicitation_failed` fallback.
 *
 * @param message - Dialog text built from server-stored intents.
 */
async function elicitDecision(message: string): Promise<ElicitOutcome> {
  if (!server.getClientCapabilities()?.elicitation) return { action: 'unsupported' }
  try {
    const result = await server.elicitInput(
      { mode: 'form', message, requestedSchema: DECISION_FORM_SCHEMA },
      { timeout: CONFIRM_ELICIT_TIMEOUT_MS },
    )
    if (result.action !== 'accept') return { action: result.action }
    const decision = result.content?.decision
    return decision === 'approve' || decision === 'reject' ? { action: 'accept', decision } : { action: 'cancel' }
  } catch (error) {
    if (error instanceof Error && error.message.includes('does not support')) return { action: 'unsupported' }
    throw error
  }
}

/** Builds the I/O the agent tools run on from the process-wide client and the server. */
function agentDeps(): AgentToolDeps {
  return {
    send,
    elicit: elicitDecision,
    nowSeconds: () => Math.floor(Date.now() / 1000),
    apiUrl: apiUrls.apiUrl,
    pendingActionsUrl: apiUrls.pendingActionsUrl,
    scriptScopes: scriptGrantScopes,
  }
}

/**
 * Formats a successful response payload as a standard MCP text content result.
 *
 * @param payload - The data or object to serialize into the text result.
 * @returns An MCP tool result containing JSON-serialized text.
 */
function textResult(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }] }
}

/**
 * Formats an error message into an MCP error result with `isError: true`.
 *
 * @param message - The error message string to return to the calling agent.
 * @returns An MCP tool result with an error payload and error flag.
 */
function errorResult(message: string) {
  return { content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }], isError: true }
}

/**
 * Fetches all active seed definitions from the BeechCMS API and parses the current schema version.
 *
 * @returns A promise resolving to an array of seed summaries and the active schema version number.
 */
async function listSeeds(): Promise<{ seeds: SeedSummary[]; schemaVersion: number }> {
  const { data, headers } = await request<SeedRecord[]>('GET', '/api/seeds')
  const seeds: SeedSummary[] = data.map(r => ({
    slug: r.slug,
    label: r.definition.label,
    status: r.status,
    branchCount: r.definition.branches?.length ?? 0,
    updatedAt: r.updatedAt,
  }))
  const schemaVersion = Number(headers.get('X-Schema-Version') ?? '0')
  return { seeds, schemaVersion }
}

/**
 * Dispatches an MCP tool call to its corresponding BeechCMS API handler.
 *
 * @param name - The identifier of the MCP tool being called.
 * @param args - Key-value map of arguments supplied to the tool.
 * @returns An MCP tool result containing JSON-formatted text or error details.
 */
async function handleTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case 'beech_list_seeds':
      return textResult(await listSeeds())

    case 'beech_get_seed': {
      const slug = args.slug as string
      try {
        const { data } = await request<SeedRecord>('GET', `/api/seeds/${slug}`)
        return textResult(data)
      } catch (error) {
        if (error instanceof BeechClientError) {
          const parsed = safeParseProblem(error.message)
          if (parsed?.status === 404) return errorResult(`No seed with slug '${slug}'`)
        }
        throw error
      }
    }

    case 'beech_schema_export': {
      const { data } = await request('GET', '/api/schema')
      return textResult(data)
    }

    case 'beech_schema_validate': {
      const rawCandidate = args.candidate as Seed
      const { data: activeSeeds } = await request<Seed[]>('GET', '/api/schema')
      const stored = activeSeeds.find(s => s.slug === rawCandidate.slug)

      const candidate: Seed = resolveCandidateIds(rawCandidate, stored ?? null)

      if (!candidate.displayNameAlias) {
        if (stored?.displayNameAlias) {
          candidate.displayNameAlias = stored.displayNameAlias
        } else {
          const firstText = candidate.branches.find(b => b.type === 'text')
          if (firstText) {
            candidate.displayNameAlias = firstText.alias
          }
        }
      }

      const candidateSet = [...activeSeeds.filter(s => s.slug !== candidate.slug), candidate]
      const issues = validateSeedDefinitions(candidateSet).filter(i => i.slug === candidate.slug)
      return textResult({ issues })
    }

    case 'beech_schema_plan': {
      const slug = args.slug as string
      const candidate = args.candidate as Seed
      const { data } = await request<McpPlanResponse>('POST', `/api/seeds/${slug}/mcp-plan`, { candidate })
      const stored = savePlan({
        slug,
        candidate,
        expectedVersion: data.expectedVersion,
        classification: data.classification,
        statements: data.statements,
        ftsRebuildNeeded: data.ftsRebuildNeeded,
      })
      return textResult({ planId: stored.planId, ...data, expiresInSeconds: 600 })
    }

    case 'beech_schema_apply': {
      const planId = args.planId as string
      const result = takePlan(planId)
      if (result.status === 'not_found') return errorResult(`Unknown planId '${planId}'.`)
      if (result.status === 'expired') return errorResult(`Plan ${planId} expired (10-minute TTL). Re-run beech_schema_plan.`)

      const { plan } = result
      if (plan.classification === 'destructive') {
        return errorResult(
          `Plan ${planId} is classified 'destructive' and cannot be applied via beech_schema_apply — use the dedicated endpoint the plan named.`
        )
      }

      try {
        const { data } = await request(
          'POST',
          `/api/seeds/${plan.slug}/mcp-apply`,
          { candidate: plan.candidate, expectedVersion: plan.expectedVersion, planId }
        )
        return textResult(data)
      } catch (error) {
        if (error instanceof BeechClientError) {
          const parsed = safeParseProblem(error.message)
          if (parsed?.status === 409) {
            return errorResult(`${parsed.detail} Re-run beech_schema_plan; the previous plan has been discarded.`)
          }
        }
        throw error
      }
    }

    case 'beech_docs_search': {
      const query = args.query as string
      const limit = typeof args.limit === 'number' ? args.limit : 10
      return textResult({ query, results: searchResources(query, limit) })
    }

    case 'beech_whoami':
      return textResult(await beechWhoami(agentDeps()))

    case 'beech_intents':
      return textResult(await beechIntents(agentDeps()))

    case 'beech_confirm':
      return textResult(await beechConfirm({ intentIds: args.intentIds }, agentDeps()))

    case 'beech_search': {
      const { query } = args
      if (typeof query !== 'string' || query.trim() === '') return errorResult('query must be a non-empty string.')
      const detail = args.detail ?? 'signature'
      if (!SEARCH_DETAILS.includes(detail as SearchDetail)) {
        return errorResult(`detail must be one of: ${SEARCH_DETAILS.join(', ')}.`)
      }
      const requestedLimit = typeof args.limit === 'number' && Number.isFinite(args.limit) ? Math.trunc(args.limit) : SEARCH_DEFAULT_LIMIT
      const limit = Math.min(SEARCH_MAX_LIMIT, Math.max(1, requestedLimit))
      const allowedScopes = scriptGrantScopes()
      return textResult({
        query,
        detail,
        scriptScopesKnown: allowedScopes !== null,
        operations: searchOperations(query, { detail: detail as SearchDetail, limit, allowedScopes }),
        docs: searchResources(query, SEARCH_DOCS_LIMIT).map(({ uri, title, snippet }) => ({ uri, title, snippet })),
      })
    }

    case 'beech_mcp_status': {
      const bundleHash = computeBundleHash([fileURLToPath(import.meta.url)])
      return textResult({
        name: MCP_SERVER_NAME,
        version: MCP_SERVER_VERSION,
        pid: process.pid,
        uptime: Math.round(process.uptime()),
        bundleHash,
        resourceCount: getResourceCount(),
      })
    }

    case 'beech_mcp_reload': {
      clearResourceCache()
      await server.sendResourceListChanged()
      await server.sendToolListChanged()
      const bundleHash = computeBundleHash([fileURLToPath(import.meta.url)])
      return textResult({
        reloaded: true,
        bundleHash,
        resourceCount: getResourceCount(),
      })
    }

    default:
      return errorResult(`Unknown tool '${name}'.`)
  }
}

/**
 * Safely attempts to parse an RFC 7807 problem details JSON payload from an error message.
 *
 * @param message - The error message string that may contain JSON.
 * @returns Parsed problem details object if valid JSON, otherwise `null`.
 */
function safeParseProblem(message: string): { status?: number; title?: string; detail?: string } | null {
  try { return JSON.parse(message) } catch { return null }
}

/**
 * BeechCMS Model Context Protocol (MCP) server instance.
 */
const server = new Server(
  { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
  { capabilities: { tools: { listChanged: true }, resources: { listChanged: true, subscribe: true } } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  try {
    return await handleTool(req.params.name, (req.params.arguments ?? {}) as Record<string, unknown>)
  } catch (error) {
    const message = error instanceof BeechClientError || error instanceof AgentToolError || error instanceof Error ? error.message : String(error)
    return errorResult(message)
  }
})

server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: listResources() }))

server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  const { uri, mimeType, text } = readResource(req.params.uri)
  return { contents: [{ uri, mimeType, text }] }
})

/**
 * Runs the MCP server directly on standard I/O (stdio) transport.
 */
async function runServer() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

/**
 * Main process entry point. Launches the supervisor proxy in development or watch mode,
 * or runs the server directly when invoked as a child process or with `--no-watch`.
 */
async function main() {
  const isChild = process.env.BEECH_MCP_CHILD === '1'
  const disableWatch =
    process.argv.includes('--no-watch') ||
    process.env.NODE_ENV === 'production' ||
    process.env.BEECH_MCP_WATCH === '0'

  if (isChild || disableWatch) {
    await runServer()
    return
  }

  const currentFile = fileURLToPath(import.meta.url)
  const resourcesManifest = join(dirname(currentFile), '..', 'resources', 'manifest.json')

  await startSupervisorStdio({
    entryFile: currentFile,
    childArgs: process.argv.slice(2),
    watchTargets: [currentFile, resourcesManifest],
    debounceMs: 200,
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
