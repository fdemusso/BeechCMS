// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { OAuthScope } from '../oauth/scopes.js'

/** HTTP methods an operation can be mounted on. `HEAD`, `OPTIONS` and `ALL` are never catalogued. */
export type OperationMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/** `publish` = externally visible effect; `destructive` = irreversible or privilege-changing. */
export type OperationRisk = 'read' | 'write' | 'publish' | 'destructive'

/** What a request-dependent risk rule may inspect. `body` is the parsed JSON body, or `undefined`. */
export interface OperationRiskInput {
  query: Readonly<Record<string, string>>
  body: unknown
}

/**
 * Risk of an agent operation: either static, or derived from the request when the same
 * route can be a plain write or a publish/destructive action. Rules never throw.
 */
export type OperationRiskRule = OperationRisk | ((input: OperationRiskInput) => OperationRisk)

interface OperationBase {
  /** Stable `domain.camelCaseVerb` id, e.g. `content.bulkUpdate`. Never reused. */
  id: string
  method: OperationMethod
  /** Hono route pattern, byte-identical to `createBeechApp().routes[].path`. */
  path: string
  /** One English sentence, imperative, no trailing period. */
  summary: string
  /** File under `docs/reference/`, e.g. `internal-content.md`. */
  docs?: string
}

/** An operation an OAuth-authenticated agent may call, given the scope and risk clearance. */
export interface AgentOperationSpec extends OperationBase {
  exposure: 'agent'
  scope: OAuthScope
  risk: OperationRiskRule
}

/** An operation no agent may call, whatever scope it holds. */
export interface ExcludedOperationSpec extends OperationBase {
  exposure: 'excluded'
  /** Why no agent may call this, one sentence. Required: an exclusion without a reason is a finding. */
  excludedReason: string
}

/** One catalogued HTTP operation: a single `method` + `path` pair mounted by the API. */
export type OperationSpec = AgentOperationSpec | ExcludedOperationSpec

/** Whether an operation is reachable by agents (`agent`) or human-only/unreachable (`excluded`). */
export type OperationExposure = OperationSpec['exposure']
