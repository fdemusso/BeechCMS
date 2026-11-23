// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { OPERATION_CATALOG } from './catalog.js'
import type { AgentOperationSpec, OperationRisk, OperationRiskInput, OperationSpec } from './types.js'

/** Specificity rank of one pattern segment: lower wins. */
const SEGMENT_RANK = { literal: 0, param: 1, regexParam: 2 } as const

interface CompiledSegment {
  rank: (typeof SEGMENT_RANK)[keyof typeof SEGMENT_RANK]
  source: string
}

interface CompiledOperation {
  operation: OperationSpec
  segments: readonly CompiledSegment[]
  pattern: RegExp
}

const SUPPORTED_METHODS: ReadonlySet<string> = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
const REGEX_PARAM = /^:[^{]+\{(.+)\}$/

const escapeRegExp = (literal: string): string => literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function compileSegment(segment: string): CompiledSegment {
  if (!segment.startsWith(':')) return { rank: SEGMENT_RANK.literal, source: escapeRegExp(segment) }
  const regexParam = REGEX_PARAM.exec(segment)
  if (regexParam) return { rank: SEGMENT_RANK.regexParam, source: `(?:${regexParam[1]})` }
  return { rank: SEGMENT_RANK.param, source: '[^/]+' }
}

function compileOperation(operation: OperationSpec): CompiledOperation {
  const segments = operation.path.split('/').map(compileSegment)
  const pattern = new RegExp(`^${segments.map(segment => segment.source).join('/')}$`)
  return { operation, segments, pattern }
}

/**
 * Left-to-right segment comparison: at the first position where the ranks differ,
 * the more literal pattern sorts first. Ties fall back to path and method so the
 * result never depends on catalog order.
 */
function compareBySpecificity(left: CompiledOperation, right: CompiledOperation): number {
  const sharedLength = Math.min(left.segments.length, right.segments.length)
  for (let index = 0; index < sharedLength; index++) {
    const rankDelta = left.segments[index].rank - right.segments[index].rank
    if (rankDelta !== 0) return rankDelta
  }
  if (left.segments.length !== right.segments.length) return right.segments.length - left.segments.length
  if (left.operation.path !== right.operation.path) return left.operation.path < right.operation.path ? -1 : 1
  return left.operation.method < right.operation.method ? -1 : left.operation.method > right.operation.method ? 1 : 0
}

let compiledCatalog: readonly CompiledOperation[] | null = null

/** Lazily compiled, specificity-sorted view of {@link OPERATION_CATALOG}; derived only from the constant. */
function getCompiledCatalog(): readonly CompiledOperation[] {
  compiledCatalog ??= OPERATION_CATALOG.map(compileOperation).sort(compareBySpecificity)
  return compiledCatalog
}

/**
 * Finds the catalogued operation a request addresses.
 *
 * @param method - Upper-case HTTP method; anything outside `GET|POST|PUT|PATCH|DELETE` misses.
 * @param path - Request pathname (`c.req.path`), without query string. One trailing slash is ignored.
 * @returns The most specific matching operation (literal segments beat parameters), or `null`
 *   on any miss. Fail-closed: a miss is never upgraded to a guess. Never throws.
 */
export function matchOperation(method: string, path: string): OperationSpec | null {
  if (!SUPPORTED_METHODS.has(method)) return null
  const pathname = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
  const compiled = getCompiledCatalog().find(
    candidate => candidate.operation.method === method && candidate.pattern.test(pathname),
  )
  return compiled?.operation ?? null
}

/**
 * Resolves the effective risk of an agent operation for one request.
 *
 * @param operation - An `agent` entry of {@link OPERATION_CATALOG}.
 * @param input - The request query and parsed JSON body (`undefined` when absent).
 * @returns The static risk as is, or the result of the operation's request-dependent rule.
 */
export function resolveOperationRisk(operation: AgentOperationSpec, input: OperationRiskInput): OperationRisk {
  return typeof operation.risk === 'function' ? operation.risk(input) : operation.risk
}
