// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { OperationRisk } from './types.js'

/** Deployment class the confirmation policy depends on (ROADMAP §4.5). */
export type AgentEnvironment = 'development' | 'production'

/** `'production'` iff `env === 'production'`; anything else (unset included) is development, as in the factory CORS rule. */
export function agentEnvironment(env: string | undefined): AgentEnvironment {
  return env === 'production' ? 'production' : 'development'
}

/**
 * Whether an OAuth request of this risk must become an intent instead of running.
 * `destructive` always; `publish` only in production; `read` / `write` never.
 */
export function requiresConfirmation(risk: OperationRisk, environment: AgentEnvironment): boolean {
  if (risk === 'destructive') return true
  return risk === 'publish' && environment === 'production'
}
