// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * Logic and authoritative schema reference for the `beech_automations` MCP tool.
 *
 * Pure of the MCP SDK and client singleton; I/O is injected so unit tests can cover
 * HTTP/scope paths without network calls.
 *
 * @module
 */

import { AgentToolError } from './agent-tools.js'

export interface AutomationsToolDeps {
  send(method: 'GET', path: string): Promise<Response>
}

export const AUTOMATIONS_GUIDE = {
  triggers: {
    events: ['create', 'update', 'delete', 'cron'],
    rules: [
      'At least one trigger is required; duplicate events are rejected.',
      'At most one cron trigger per automation; cron must be a valid 5-field UTC cron expression.',
    ],
  },
  trigger_conditions: {
    type: 'WhenNode | null (max nesting depth 10)',
    predicate: {
      kind: 'predicate',
      left: '{ kind: "literal", value } | { kind: "ref", key } (e.g. "this.status")',
      op: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'startswith', 'endswith', 'in', 'notin', 'isempty', 'isnotempty', 'matches'],
      right: 'optional WhenOperand (omitted for isempty / isnotempty)',
    },
    group: {
      kind: 'group',
      op: ['AND', 'OR'],
      children: 'WhenNode[] (min 1)',
      negate: 'optional boolean',
    },
  },
  actions: {
    webhook: {
      required: ['type: "webhook"', 'url', 'body_template'],
      optional: ['method ("POST" | "GET" | "PUT")', 'headers (Record<string, string>)'],
      notes: 'url must be a static https:// URL (no {{...}} interpolation) and cannot target private IP ranges.',
    },
    send_mail: {
      required: ['type: "send_mail"', 'to', 'subject_template', 'body_template'],
      optional: [],
      notes: 'to accepts a valid email address or a {{...}} placeholder (e.g. "{{this.email}}").',
    },
    edit_field: {
      required: ['type: "edit_field"', 'field', 'value'],
      optional: [],
      notes: 'Updates the triggering entry only (no parent/sibling updates). Refuses localized fields. String value supports {{...}}.',
    },
    create_entry: {
      required: ['type: "create_entry"', 'seed_slug', 'field_map'],
      optional: [],
      notes: 'field_map maps targetField -> sourceFieldAlias (or literal string; no {{...}} interpolation). Created entry always starts as "draft".',
    },
    set_variable: {
      required: ['type: "set_variable"', 'name'],
      optional: ['seed_slug', 'fixed_id', 'column', 'filters ([{ field, op, value }])', 'order_by', 'order ("asc" | "desc")'],
      notes: 'Runs sequentially in actions[]; fixed_id and string filters[].value support {{...}}. Aggregates: count, sum, avg, min, max, pluck.',
    },
  },
  templating: {
    syntax: ['{{this.field}}', '{{this:field}}', '{{varName.field}}', '{{varName.count}}', '{{seed:byid(id):field}}', '{{seed:all:sum:field}}'],
    interpolatedFields: [
      'send_mail.to',
      'send_mail.subject_template',
      'send_mail.body_template',
      'webhook.body_template',
      'edit_field.value (when string)',
      'set_variable.fixed_id',
      'set_variable.filters[].value (when string)',
    ],
  },
  limits: [
    'edit_field updates only the triggering entry; use lifecycle hooks (mutateField / runBatch) for cross-seed or parent updates.',
    'No arithmetic in templates (e.g. {{this.stock - 1}} is invalid); use repository.mutateField for atomic counters.',
    'No previous/old entry values in WhenNode conditions.',
    'set_variable variables are available only to later actions, not inside trigger_conditions.',
    'edit_field refuses localized fields; create_entry.field_map does not evaluate {{...}} templates.',
  ],
  writeViaScript: {
    sdkMethods: ['beech.automations.list', 'beech.automations.get', 'beech.automations.create', 'beech.automations.update', 'beech.automations.toggle', 'beech.automations.delete'],
    approval: 'create, update, toggle have risk "publish" (needs beech_confirm in production); delete has risk "destructive" (always needs beech_confirm).',
  },
} as const

export interface AutomationsToolResult {
  seed?: string
  automations?: unknown[]
  schema: typeof AUTOMATIONS_GUIDE
}

interface ErrorBody {
  type?: string
  error?: string
  error_description?: string
}

async function readErrorBody(response: Response): Promise<ErrorBody> {
  try {
    return (await response.json()) as ErrorBody
  } catch {
    return {}
  }
}

/**
 * Returns the automation rule schema, template reference, and hard limits; when `seed` is
 * supplied, also fetches existing automations for that seed via `GET /api/automations?seed=`.
 */
export async function beechAutomations(
  input: { seed?: unknown },
  deps: AutomationsToolDeps,
): Promise<AutomationsToolResult> {
  if (input.seed === undefined) {
    return { schema: AUTOMATIONS_GUIDE }
  }
  if (typeof input.seed !== 'string' || input.seed.trim() === '') {
    throw new AgentToolError('seed must be a non-empty string when provided.')
  }

  const seed = input.seed.trim()
  const path = `/api/automations?seed=${encodeURIComponent(seed)}`
  const response = await deps.send('GET', path)
  if (!response.ok) {
    const body = await readErrorBody(response)
    if (response.status === 403 && body.error === 'insufficient_scope') {
      const scope = body.error_description?.match(/'([^']+)'/)?.[1] ?? 'automations:read'
      throw new AgentToolError(
        `Token lacks the '${scope}' scope. Revoke 'BeechCMS MCP Server' under Settings → Connected apps and re-authorize.`,
      )
    }
    throw new AgentToolError(`GET ${path} answered ${response.status} ${body.type ?? body.error ?? 'error'}`)
  }

  let automations: unknown
  try {
    automations = await response.json()
  } catch {
    throw new AgentToolError(`GET ${path} answered ${response.status} with a non-JSON body`)
  }
  if (!Array.isArray(automations)) {
    throw new AgentToolError(`GET ${path} returned an unexpected payload`)
  }

  return { seed, automations, schema: AUTOMATIONS_GUIDE }
}
