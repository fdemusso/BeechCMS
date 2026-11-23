// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * Decision logic of the agent control-plane tools: `beech_whoami`, `beech_intents`, `beech_confirm`.
 *
 * All I/O is injected ({@link AgentToolDeps}), so the flow tier can run it over the real API and the unit
 * tier can cover transport failures. Imports neither the API client singleton nor the MCP SDK.
 *
 * @module
 */

import {
  CONFIRM_BODY_PREVIEW_CHARS,
  CONFIRM_MAX_INTENTS,
  CONFIRM_RESULT_PREVIEW_CHARS,
} from './constants.js'

export type ElicitOutcome =
  | { action: 'accept'; decision: 'approve' | 'reject' }
  | { action: 'decline' }
  | { action: 'cancel' }
  | { action: 'unsupported' }

/** Structural subset of the MCP SDK ElicitResult; declared here so this module never imports the SDK. */
export interface ElicitAnswer {
  action: string
  content?: Record<string, unknown>
}

/**
 * Maps a client's elicitation answer to the only outcomes {@link beechConfirm} acts on. Fails closed: an accepted
 * answer without a valid decision, or an unknown action, is a cancel. Never throws, never returns `unsupported`.
 *
 * @param answer - The client's elicitation answer.
 */
export function mapElicitResult(answer: ElicitAnswer): ElicitOutcome {
  if (answer.action === 'decline') return { action: 'decline' }
  if (answer.action !== 'accept') return { action: 'cancel' }
  const decision = answer.content?.decision
  return decision === 'approve' || decision === 'reject' ? { action: 'accept', decision } : { action: 'cancel' }
}

export interface AgentToolDeps {
  /** Authenticated request; resolves with the final Response whatever its status (ApiClient.send). */
  send(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Response>
  /** Shows `message` with CONFIRM_DECISION_SCHEMA. Resolves `unsupported` when the client cannot elicit; may reject on transport failure. */
  elicit(message: string): Promise<ElicitOutcome>
  /** Unix seconds. */
  nowSeconds(): number
  apiUrl: string
  pendingActionsUrl: string
  scriptScopes(): string[] | null
}

/** Thrown for invalid input or an unexpected API answer; index.ts turns it into an `isError` result. */
export class AgentToolError extends Error {}

export interface WhoamiResult {
  user: { id: string; email: string; name: string | null; surname: string | null }
  permissions: { global: string[]; byScope: Record<string, string[]> }
  environment: 'development' | 'production'
  confirmation: { publish: boolean; destructive: boolean }
  schemaVersion: number
  mcp: { clientId: string | null; scopes: string[] | null }
  scripts: { clientId: 'beech-mcp-cli'; scopes: string[] | null }
  apiUrl: string
  pendingActionsUrl: string
}

export interface PendingIntentSummary {
  id: string
  operationId: string
  risk: 'publish' | 'destructive'
  summary: string
  expiresAt: number
  expiresInSeconds: number
}

export interface IntentsResult {
  intents: PendingIntentSummary[]
  pendingActionsUrl: string
}

export type ConfirmOutcome =
  | 'executed' | 'failed' | 'rejected' | 'pending'
  | 'expired' | 'not_pending' | 'not_found' | 'error'

export interface ConfirmItemResult {
  id: string
  outcome: ConfirmOutcome
  operationId: string | null
  summary: string | null
  /** Replay status for executed/failed, else null. */
  resultStatus: number | null
  /** Replay body: parsed JSON, or its text cut to CONFIRM_RESULT_PREVIEW_CHARS; null when none. */
  resultBody: unknown
  /** Set for outcome 'error' only. */
  message: string | null
}

export interface ConfirmResult {
  status: 'decided' | 'declined' | 'cancelled' | 'fallback' | 'nothing_pending'
  decision: 'approve' | 'reject' | null
  /** One entry per distinct requested id, in request order. */
  results: ConfirmItemResult[]
  pendingActionsUrl: string
  /** What the agent must tell the human; null when status is 'decided' or 'nothing_pending'. */
  instruction: string | null
  /** Set only for 'fallback'. */
  reason: 'elicitation_unsupported' | 'elicitation_failed' | null
}

/** Wire shapes of the API answers this module reads. */
interface SessionBody {
  userId: string
  clientId: string | null
  scopes: string[] | null
  environment: 'development' | 'production'
  confirmation: { publish: boolean; destructive: boolean }
  schemaVersion: number
}

interface MeBody {
  id: string
  email: string
  name: string | null
  surname: string | null
  permissions: { global: string[]; byScope: Record<string, string[]> }
}

interface IntentBody {
  id: string
  operationId: string
  risk: 'publish' | 'destructive'
  summary: string
  status: string
  expiresAt: number
  body?: unknown
}

interface ReplayBody {
  intent: IntentBody
  result: { status: number; body: unknown }
}

interface ErrorBody {
  type?: string
  error?: string
  error_description?: string
}

type Method = 'GET' | 'POST'

/** Parses a response body once, or throws when a 2xx answer is not JSON. */
async function readJson<T>(response: Response, method: Method, path: string): Promise<T> {
  try {
    return (await response.json()) as T
  } catch {
    throw new AgentToolError(`${method} ${path} answered ${response.status} with a non-JSON body`)
  }
}

/** Parses an error body, tolerating non-JSON. */
async function readErrorBody(response: Response): Promise<ErrorBody> {
  try {
    return (await response.json()) as ErrorBody
  } catch {
    return {}
  }
}

/** Builds the message of a non-2xx answer: the missing scope for `insufficient_scope`, else status and error type. */
function describeFailure(method: Method, path: string, status: number, body: ErrorBody): string {
  if (status === 403 && body.error === 'insufficient_scope') {
    const scope = body.error_description?.match(/'([^']+)'/)?.[1] ?? ''
    return `Token lacks the '${scope}' scope. Revoke 'BeechCMS MCP Server' under Settings → Connected apps and re-authorize.`
  }
  return `${method} ${path} answered ${status} ${body.type ?? body.error ?? 'error'}`
}

/** Sends a request that must answer 2xx and returns its JSON body. */
async function fetchOk<T>(deps: AgentToolDeps, method: Method, path: string): Promise<T> {
  const response = await deps.send(method, path)
  if (!response.ok) throw new AgentToolError(describeFailure(method, path, response.status, await readErrorBody(response)))
  return readJson<T>(response, method, path)
}

/**
 * Reports who the agent acts as and what the server enforces for it.
 *
 * @param deps - Injected I/O.
 * @returns User, RBAC permissions, token scopes, environment and confirmation policy.
 * @throws {AgentToolError} When either read is not 2xx JSON.
 */
export async function beechWhoami(deps: AgentToolDeps): Promise<WhoamiResult> {
  const [session, me] = await Promise.all([
    fetchOk<SessionBody>(deps, 'GET', '/api/agent/session'),
    fetchOk<MeBody>(deps, 'GET', '/api/settings/me'),
  ])
  return {
    user: { id: me.id, email: me.email, name: me.name, surname: me.surname },
    permissions: me.permissions,
    environment: session.environment,
    confirmation: session.confirmation,
    schemaVersion: session.schemaVersion,
    mcp: { clientId: session.clientId, scopes: session.scopes },
    scripts: { clientId: 'beech-mcp-cli', scopes: deps.scriptScopes() },
    apiUrl: deps.apiUrl,
    pendingActionsUrl: deps.pendingActionsUrl,
  }
}

/**
 * Lists the caller's pending intents, newest first as the server answers.
 *
 * @param deps - Injected I/O.
 * @throws {AgentToolError} When the read is not 2xx JSON.
 */
export async function beechIntents(deps: AgentToolDeps): Promise<IntentsResult> {
  const { intents } = await fetchOk<{ intents: IntentBody[] }>(deps, 'GET', '/api/agent/intents')
  const now = deps.nowSeconds()
  return {
    intents: intents.map(intent => ({
      id: intent.id,
      operationId: intent.operationId,
      risk: intent.risk,
      summary: intent.summary,
      expiresAt: intent.expiresAt,
      expiresInSeconds: Math.max(0, intent.expiresAt - now),
    })),
    pendingActionsUrl: deps.pendingActionsUrl,
  }
}

function emptyItem(id: string, outcome: ConfirmOutcome): ConfirmItemResult {
  return { id, outcome, operationId: null, summary: null, resultStatus: null, resultBody: null, message: null }
}

function describeIntent(intent: IntentBody, item: ConfirmItemResult): ConfirmItemResult {
  return { ...item, operationId: intent.operationId, summary: intent.summary }
}

function cutWithEllipsis(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text
}

/** Replay body kept as parsed JSON when its text fits the preview, else its text cut to the preview size. */
function previewResultBody(body: unknown): unknown {
  if (body === null || body === undefined) return null
  if (typeof body === 'string') return body.length > CONFIRM_RESULT_PREVIEW_CHARS ? body.slice(0, CONFIRM_RESULT_PREVIEW_CHARS) : body
  const text = JSON.stringify(body)
  return text.length > CONFIRM_RESULT_PREVIEW_CHARS ? text.slice(0, CONFIRM_RESULT_PREVIEW_CHARS) : body
}

/** Builds the dialog text from stored intents only. */
function buildDialogMessage(shown: readonly IntentBody[], now: number): string {
  const lines = [`BeechCMS: ${shown.length} action(s) wait for your approval. Nothing has run yet.`]
  shown.forEach((intent, index) => {
    const minutes = Math.ceil((intent.expiresAt - now) / 60)
    lines.push(`${index + 1}. [${intent.risk}] ${intent.summary} (expires in ${minutes} min)`)
    if (intent.body !== null && intent.body !== undefined) {
      lines.push(`   body: ${cutWithEllipsis(JSON.stringify(intent.body), CONFIRM_BODY_PREVIEW_CHARS)}`)
    }
  })
  lines.push('approve runs each action once with your permissions; reject discards them.')
  // The Decision field is required and starts empty: clients keep Accept inert until it is set, with no hint why.
  lines.push('To answer, set Decision first (terminal: → opens the field, ↑/↓ choose, Enter confirms), then Accept. Accept does nothing while Decision is empty.')
  return lines.join('\n')
}

/** Maps a non-200 decision answer to an outcome. */
function failedDecisionItem(item: ConfirmItemResult, method: Method, path: string, status: number, body: ErrorBody): ConfirmItemResult {
  if (status === 404) return { ...item, outcome: 'not_found' }
  if (status === 409 && body.type === 'intent_expired') return { ...item, outcome: 'expired' }
  if (status === 409 && body.type === 'intent_not_pending') return { ...item, outcome: 'not_pending' }
  return { ...item, outcome: 'error', message: describeFailure(method, path, status, body) }
}

/** Posts one decision, never throwing on transport, HTTP or body-parse failure. */
async function decide(deps: AgentToolDeps, item: ConfirmItemResult, decision: 'approve' | 'reject'): Promise<ConfirmItemResult> {
  const path = `/api/agent/intents/${item.id}/${decision}`
  let response: Response
  try {
    response = await deps.send('POST', path)
  } catch (error) {
    return { ...item, outcome: 'error', message: error instanceof Error ? error.message : String(error) }
  }
  if (response.status !== 200) {
    return failedDecisionItem(item, 'POST', path, response.status, await readErrorBody(response))
  }
  if (decision === 'reject') return { ...item, outcome: 'rejected' }

  let result: ReplayBody['result']
  try {
    ;({ result } = await readJson<ReplayBody>(response, 'POST', path))
  } catch (error) {
    // A 200 means the server already replayed the request: report it, never retry blindly.
    const reason = error instanceof Error ? error.message : String(error)
    return {
      ...item,
      outcome: 'error',
      resultStatus: response.status,
      message: `${reason}. The server answered 200, so the action probably ran: check the dashboard before retrying.`,
    }
  }
  return {
    ...item,
    outcome: result.status < 400 ? 'executed' : 'failed',
    resultStatus: result.status,
    resultBody: previewResultBody(result.body),
  }
}

/** Instruction the agent relays to the human when nothing was decided. */
function buildFallbackInstruction(shown: readonly IntentBody[], now: number, pendingActionsUrl: string): string {
  const smallestRemainingMinutes = Math.min(...shown.map(intent => Math.ceil((intent.expiresAt - now) / 60)))
  return `Nothing ran. Tell the human that ${shown.length} action(s) wait for approval in the BeechCMS dashboard: ${pendingActionsUrl}. They expire in ${smallestRemainingMinutes} min. Call beech_intents to see what is still pending.`
}

/** Validates `intentIds`: 1..CONFIRM_MAX_INTENTS non-empty strings, duplicates collapsed (first wins). */
function parseIntentIds(intentIds: unknown): string[] {
  if (!Array.isArray(intentIds) || !intentIds.every(id => typeof id === 'string' && id.length > 0)) {
    throw new AgentToolError('intentIds must be an array of non-empty strings.')
  }
  const distinct = [...new Set(intentIds as string[])]
  if (distinct.length < 1 || distinct.length > CONFIRM_MAX_INTENTS) {
    throw new AgentToolError(`intentIds must hold between 1 and ${CONFIRM_MAX_INTENTS} distinct ids.`)
  }
  return distinct
}

/** Loads one intent; a loaded pending, unexpired intent is returned as `shown`. */
async function loadIntent(
  deps: AgentToolDeps,
  id: string,
): Promise<{ item: ConfirmItemResult; shown: IntentBody | null }> {
  const path = `/api/agent/intents/${id}`
  let response: Response
  try {
    response = await deps.send('GET', path)
  } catch (error) {
    return { item: { ...emptyItem(id, 'error'), message: error instanceof Error ? error.message : String(error) }, shown: null }
  }
  if (response.status === 404) return { item: emptyItem(id, 'not_found'), shown: null }
  if (!response.ok) {
    const message = describeFailure('GET', path, response.status, await readErrorBody(response))
    return { item: { ...emptyItem(id, 'error'), message }, shown: null }
  }

  const { intent } = await readJson<{ intent: IntentBody }>(response, 'GET', path)
  const item = describeIntent(intent, emptyItem(id, 'pending'))
  if (intent.status !== 'pending') return { item: { ...item, outcome: 'not_pending' }, shown: null }
  if (intent.expiresAt <= deps.nowSeconds()) return { item: { ...item, outcome: 'expired' }, shown: null }
  return { item, shown: intent }
}

/**
 * Asks the human, in one dialog built from server-stored intents, to approve or reject pending intents.
 * Decline, cancel, an unsupported client and an elicitation failure send no decision request.
 *
 * @param input - `intentIds`: 1..20 distinct intent ids.
 * @param deps - Injected I/O.
 * @throws {AgentToolError} For invalid ids (before any request) or a non-JSON 2xx answer on a detail read.
 */
export async function beechConfirm(input: { intentIds: unknown }, deps: AgentToolDeps): Promise<ConfirmResult> {
  const ids = parseIntentIds(input.intentIds)

  const items = new Map<string, ConfirmItemResult>()
  const shown: IntentBody[] = []
  for (const id of ids) {
    const loaded = await loadIntent(deps, id)
    items.set(id, loaded.item)
    if (loaded.shown) shown.push(loaded.shown)
  }

  const finish = (partial: Pick<ConfirmResult, 'status' | 'decision' | 'instruction' | 'reason'>): ConfirmResult => ({
    ...partial,
    results: ids.map(id => items.get(id) as ConfirmItemResult),
    pendingActionsUrl: deps.pendingActionsUrl,
  })

  if (shown.length === 0) return finish({ status: 'nothing_pending', decision: null, instruction: null, reason: null })

  const instruction = buildFallbackInstruction(shown, deps.nowSeconds(), deps.pendingActionsUrl)
  let outcome: ElicitOutcome
  try {
    outcome = await deps.elicit(buildDialogMessage(shown, deps.nowSeconds()))
  } catch {
    return finish({ status: 'fallback', decision: null, instruction, reason: 'elicitation_failed' })
  }

  if (outcome.action === 'unsupported') return finish({ status: 'fallback', decision: null, instruction, reason: 'elicitation_unsupported' })
  if (outcome.action === 'decline') return finish({ status: 'declined', decision: null, instruction, reason: null })
  if (outcome.action === 'cancel') return finish({ status: 'cancelled', decision: null, instruction, reason: null })

  for (const intent of shown) {
    const current = items.get(intent.id) as ConfirmItemResult
    items.set(intent.id, await decide(deps, current, outcome.decision))
  }
  return finish({ status: 'decided', decision: outcome.decision, instruction: null, reason: null })
}
