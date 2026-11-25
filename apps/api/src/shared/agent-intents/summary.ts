// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { Context } from 'hono'
import { GLOBAL_SCOPE, hasPermission, type AgentOperationSpec } from '@beechcms/core'
import type { AppEnv } from '../../types'
import { resolveEffectivePermissions } from '../rbac/effective-permissions'

const MAX_LABEL_LENGTH = 80

/** What the dialog is built from; the same request fields the gate already holds. */
export interface IntentSummaryInput {
  method: string
  pathname: string
  pathWithQuery: string
  /** Parsed JSON body, `undefined` when absent or malformed. */
  body: unknown
}

type Describer = (context: Context<AppEnv>, input: IntentSummaryInput, params: Record<string, string>) => Promise<string | null>

/**
 * Flattens stored text into one line and drops `"`, so a role name or an email taken from a request
 * can neither add lines to the dialog nor close the quoted label and forge the words after it.
 */
function label(value: string): string {
  const flat = [...value.replace(/[\p{C}\s]+/gu, ' ').replace(/"/g, "'").trim()]
  return flat.length > MAX_LABEL_LENGTH ? `${flat.slice(0, MAX_LABEL_LENGTH - 1).join('')}…` : flat.join('')
}

const scopeLabel = (scope: string): string => (scope === GLOBAL_SCOPE ? 'all seeds' : label(scope))

const text = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null)

/**
 * Names are only resolved for a caller who could read the grant anyway. Without `manage_users` on
 * the scope the handler answers 403/404, and the summary must not become a lookup oracle for it.
 */
async function mayName(context: Context<AppEnv>, scope: string): Promise<boolean> {
  return hasPermission(await resolveEffectivePermissions(context), 'manage_users', scope)
}

const describeAssign: Describer = async (context, { body }) => {
  const fields = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  const userId = text(fields.userId)
  const roleId = text(fields.roleId)
  const scope = text(fields.scope)?.trim()
  if (!userId || !roleId || !scope || !(await mayName(context, scope))) return null

  const [user, role] = await Promise.all([context.get('userRepository').findById(userId), context.get('roleRepository').findById(roleId)])
  return user && role ? `Assign role "${label(role.name)}" to ${label(user.email)} on ${scopeLabel(scope)}` : null
}

const describeInvite: Describer = async (context, { body }) => {
  const fields = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  const email = text(fields.email)
  const roleId = text(fields.roleId)
  const scope = text(fields.scope)?.trim()
  if (!email || !roleId || !scope || !(await mayName(context, scope))) return null

  const role = await context.get('roleRepository').findById(roleId)
  return role ? `Invite ${label(email)} as "${label(role.name)}" on ${scopeLabel(scope)}` : null
}

const describeRemoval: Describer = async (context, _input, params) => {
  const assignment = await context.get('roleAssignmentRepository').findById(params.assignmentId)
  if (!assignment || !(await mayName(context, assignment.scope))) return null

  const [user, role] = await Promise.all([
    context.get('userRepository').findById(assignment.userId),
    context.get('roleRepository').findById(assignment.roleId),
  ])
  return user && role ? `Remove role "${label(role.name)}" from ${label(user.email)} on ${scopeLabel(assignment.scope)}` : null
}

const describeRegeneration: Describer = async (context, _input, params) => {
  const invitation = await context.get('invitationRepository').findById(params.invitationId)
  if (!invitation || !(await mayName(context, invitation.scope))) return null

  const role = await context.get('roleRepository').findById(invitation.roleId)
  return role ? `Regenerate the invitation of ${label(invitation.email)} as "${label(role.name)}" on ${scopeLabel(invitation.scope)}` : null
}

/** RBAC operations whose request carries ids only; keyed by catalog operation id. */
const DESCRIBERS: Readonly<Record<string, Describer>> = Object.freeze({
  'assignments.create': describeAssign,
  'invitations.create': describeInvite,
  'assignments.delete': describeRemoval,
  'invitations.regenerate': describeRegeneration,
})

/** Values of the `:param` segments of `pattern` read from `pathname`. */
function pathParams(pattern: string, pathname: string): Record<string, string> {
  const values = pathname.split('/')
  const params: Record<string, string> = Object.create(null)
  pattern.split('/').forEach((segment, index) => {
    if (segment.startsWith(':')) params[segment.slice(1)] = values[index] ?? ''
  })
  return params
}

/**
 * The one line the approving human reads for a stored intent.
 *
 * @remarks
 * For the RBAC operations that grant or revoke access, it names the account, the role and the scope
 * instead of their ids. Any request it cannot name (malformed body, unknown id, caller without
 * authority on the scope) gets the generic `<operation>: <method> <path>` line, which is exactly what
 * the handler's own refusal will match on approval.
 *
 * @param context - The request context, for the repositories and the caller's authority.
 * @param operation - The matched `agent` operation.
 * @param input - The request method, path and parsed body.
 * @returns The summary stored with the intent.
 */
export async function buildIntentSummary(context: Context<AppEnv>, operation: AgentOperationSpec, input: IntentSummaryInput): Promise<string> {
  const describe = DESCRIBERS[operation.id]
  const named = describe ? await describe(context, input, pathParams(operation.path, input.pathname)) : null
  return named ?? `${operation.summary}: ${input.method} ${input.pathWithQuery}`
}
