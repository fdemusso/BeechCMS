// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * Deterministic search over the agent operations of the operation catalog.
 *
 * Pure: no I/O, no client, no MCP SDK. The `beech_search` tool wraps it.
 *
 * @module
 */

import { OPERATION_CATALOG } from '@beechcms/core'
import type { AgentOperationSpec, OperationMethod, OperationRisk } from '@beechcms/core'

export type SearchDetail = 'name' | 'signature' | 'full'
export type ApprovalRule = 'never' | 'always' | 'in-production' | 'depends-on-request'

export interface OperationSearchOptions {
  detail: SearchDetail
  limit: number
  /** Scopes of the script grant; null = unknown, no scope filter. */
  allowedScopes: readonly string[] | null
}

export interface OperationSearchHit {
  id: string
  summary: string
  // 'signature' and 'full' only:
  method?: OperationMethod
  path?: string
  scope?: string
  risk?: OperationRisk | 'request-dependent'
  approval?: ApprovalRule
  /** `beech.<id>` (method name = catalog id, sprint 06), null when scripts cannot call it. */
  sdk?: string | null
  note?: string
  // 'full' only:
  pathParams?: string[]
  /** `beechcms-docs://reference/<file>` or null. */
  docs?: string | null
}

/** Mirrors `SDK_OMITTED_OPERATIONS` (packages/cli/src/sdk/operations.ts). Keep both in sync. */
export const SCRIPT_UNAVAILABLE_OPERATIONS: Readonly<Record<string, string>> = {
  'intents.approve': 'Scripts never approve. Call beech_confirm with the intent ids.',
  'media.upload': 'Use the SDK helper beech.media.uploadFile (presign, PUT, confirm).',
}

const TOKEN_SEPARATOR = /[\s./_:-]+/
const ID_WORD_BOUNDARY = /[.]|(?<=[a-z0-9])(?=[A-Z])/
const PATH_PARAM = /:([A-Za-z0-9_]+)/g

const SCORE_ID_WORD = 3
const SCORE_SUMMARY = 2
const SCORE_PATH = 1

const agentOperations: readonly AgentOperationSpec[] = OPERATION_CATALOG.filter(
  (operation): operation is AgentOperationSpec => operation.exposure === 'agent',
)

function idWords(id: string): string[] {
  return id.split(ID_WORD_BOUNDARY).map(word => word.toLowerCase()).filter(Boolean)
}

function scoreOperation(operation: AgentOperationSpec, tokens: readonly string[]): number {
  const words = idWords(operation.id)
  const summary = operation.summary.toLowerCase()
  const path = operation.path.toLowerCase()
  let score = 0
  for (const token of tokens) {
    if (words.some(word => word.startsWith(token))) score += SCORE_ID_WORD
    if (summary.includes(token)) score += SCORE_SUMMARY
    if (path.includes(token)) score += SCORE_PATH
  }
  return score
}

function approvalRule(risk: AgentOperationSpec['risk']): ApprovalRule {
  if (typeof risk === 'function') return 'depends-on-request'
  if (risk === 'destructive') return 'always'
  if (risk === 'publish') return 'in-production'
  return 'never'
}

function pathParams(path: string): string[] {
  return [...path.matchAll(PATH_PARAM)].map(match => match[1])
}

function toHit(operation: AgentOperationSpec, detail: SearchDetail): OperationSearchHit {
  const hit: OperationSearchHit = { id: operation.id, summary: operation.summary }
  if (detail === 'name') return hit

  const unavailableNote = SCRIPT_UNAVAILABLE_OPERATIONS[operation.id]
  hit.method = operation.method
  hit.path = operation.path
  hit.scope = operation.scope
  hit.risk = typeof operation.risk === 'function' ? 'request-dependent' : operation.risk
  hit.approval = approvalRule(operation.risk)
  hit.sdk = unavailableNote === undefined ? `beech.${operation.id}` : null
  if (unavailableNote !== undefined) hit.note = unavailableNote
  if (detail === 'signature') return hit

  hit.pathParams = pathParams(operation.path)
  hit.docs = operation.docs ? `beechcms-docs://reference/${operation.docs}` : null
  return hit
}

/**
 * Ranks the agent operations against a free-text query (OR over tokens).
 *
 * @param query - Free text; split on whitespace, dots, slashes, underscores, colons and dashes.
 * @param options - Detail level, result limit and the script grant's scopes (null = no scope filter).
 * @returns Hits ordered by score desc then id asc; empty when no token matches.
 */
export function searchOperations(query: string, options: OperationSearchOptions): OperationSearchHit[] {
  const tokens = query.toLowerCase().split(TOKEN_SEPARATOR).filter(Boolean)
  if (tokens.length === 0) return []

  const { allowedScopes } = options
  return agentOperations
    .filter(operation => allowedScopes === null || allowedScopes.includes(operation.scope))
    .map(operation => ({ operation, score: scoreOperation(operation, tokens) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || (a.operation.id < b.operation.id ? -1 : a.operation.id > b.operation.id ? 1 : 0))
    .slice(0, options.limit)
    .map(({ operation }) => toHit(operation, options.detail))
}
