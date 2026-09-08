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
 *
 * @module
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import type { Seed } from '@beechcms/core'
import { nextBranchId, validateSeedDefinitions } from '@beechcms/core'
import { request, BeechClientError } from './client.js'
import { savePlan, takePlan } from './plans.js'

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
  /** Whether the full-text search (FTS) virtual table index must be rebuilt. */
  ftsRebuildNeeded: boolean
  /** The schema version expected at the time the plan was calculated, for concurrency validation. */
  expectedVersion: number
  /** Any schema validation or compatibility issues identified during planning. */
  issues: { fatal: boolean; messages: string[] }[]
}

/**
 * Declarations of all Model Context Protocol (MCP) tools supported by BeechCMS.
 */
const TOOLS = [
  {
    name: 'beech_list_seeds',
    description: 'List all BeechCMS seed schemas (summaries only) plus the current schema version.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'beech_get_seed',
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
    description: 'Export the full BeechCMS schema registry snapshot (definitions + layouts).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'beech_schema_validate',
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
    description: 'Server-computes the exact DDL and safety classification for a candidate seed change. Always call before beech_schema_apply.',
    inputSchema: {
      type: 'object',
      properties: { slug: { type: 'string' }, candidate: { type: 'object' } },
      required: ['slug', 'candidate'],
      additionalProperties: false,
    },
  },
  {
    name: 'beech_schema_apply',
    description: 'Atomically applies a previously planned, additive-only schema change. Requires a planId from beech_schema_plan.',
    inputSchema: {
      type: 'object',
      properties: { planId: { type: 'string' } },
      required: ['planId'],
      additionalProperties: false,
    },
  },
]

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

      const candidate: Seed = {
        ...rawCandidate,
        branches: Array.isArray(rawCandidate.branches) ? rawCandidate.branches.map(b => ({ ...b })) : [],
      }

      const storedByAlias = new Map((stored?.branches ?? []).map(b => [b.alias, b]))
      const accSeed: Pick<Seed, 'branches'> = { branches: [] }

      for (const branch of candidate.branches) {
        if (!branch.id) {
          const matched = storedByAlias.get(branch.alias)
          if (matched?.id) {
            branch.id = matched.id
          } else {
            branch.id = nextBranchId(accSeed)
          }
        }
        accSeed.branches.push(branch)
      }

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
const server = new Server({ name: 'beechcms-mcp', version: '0.1.0' }, { capabilities: { tools: {} } })

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  try {
    return await handleTool(req.params.name, (req.params.arguments ?? {}) as Record<string, unknown>)
  } catch (error) {
    const message = error instanceof BeechClientError ? error.message : error instanceof Error ? error.message : String(error)
    return errorResult(message)
  }
})

/**
 * Connects the MCP server to standard I/O (stdio) transport and starts listening for client requests.
 */
async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
