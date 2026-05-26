// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Context } from 'hono'

// ──────────────────────────────────────────────────────────────────────────────
// FK / SQLite error detection
// ──────────────────────────────────────────────────────────────────────────────

type FkViolationKind = 'relation-in-use' | 'relation-target-not-found' | 'foreign-key-violation'

function isFkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  // D1 surfaces the error in .message
  if (/FOREIGN KEY constraint failed/i.test(error.message)) return true
  // Some runtimes expose cause.code
  const cause = (error as { cause?: { code?: string } }).cause
  if (cause?.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') return true
  return false
}

/**
 * Classify a SQLite FK error by HTTP method.
 * - DELETE  → the referenced row is still used → relation-in-use
 * - POST/PUT/PATCH → referenced parent does not exist → relation-target-not-found
 * - anything else → generic foreign-key-violation
 */
function classifyFkError(method: string): FkViolationKind {
  const m = method.toUpperCase()
  if (m === 'DELETE') return 'relation-in-use'
  if (m === 'POST' || m === 'PUT' || m === 'PATCH') return 'relation-target-not-found'
  return 'foreign-key-violation'
}

const FK_PROBLEM: Record<FkViolationKind, { title: string; status: 409 | 422; detail: string }> = {
  'relation-in-use': {
    title: 'Relation In Use',
    status: 409,
    detail: 'The record cannot be deleted because it is referenced by one or more related entries.',
  },
  'relation-target-not-found': {
    title: 'Relation Target Not Found',
    status: 422,
    detail: 'The provided relation id does not match any existing record in the referenced collection.',
  },
  'foreign-key-violation': {
    title: 'Foreign Key Violation',
    status: 409,
    detail: 'The operation violates a referential integrity constraint.',
  },
}

/**
 * Returns a Problem+JSON response when the error is a SQLite FK violation,
 * or null when the error is unrelated (let the caller handle it).
 *
 * @param c       Hono context
 * @param error   The caught error
 * @param method  HTTP method of the current request (e.g. 'DELETE', 'POST')
 */
export function fkProblemOrNull(c: Context, error: unknown, method: string): Response | null {
  if (!isFkError(error)) return null
  const kind = classifyFkError(method)
  const meta = FK_PROBLEM[kind]
  return publicProblem(c, {
    type: `https://beechcms.dev/problems/${kind}`,
    title: meta.title,
    status: meta.status,
    detail: meta.detail,
  })
}

export interface PublicProblemDetailItem {
  field: string
  expected: string
  received: string
  message: string
}

type PublicProblemInput = {
  type: string
  title: string
  status: 400 | 401 | 403 | 404 | 405 | 409 | 422 | 429 | 500 | 501
  detail: string
  errors?: PublicProblemDetailItem[]
}

/**
 * TODO: UPDATE DOMAIN ONCE REGISTERED
 * Currently uses 'beechcms.dev' as a placeholder. 
 * When a real domain is registered for BeechCMS, update the URL below 
 * to point to the official API error documentation (RFC 9457).
 */
function normalizeProblemType(type: string): string {
  if (type.startsWith('http://') || type.startsWith('https://')) {
    return type
  }
  return `https://beechcms.dev/problems/${type}`
}

export function internalErrorDetail(env: { ENV?: string }, error: unknown): string {
  if (env.ENV !== 'production' && error instanceof Error) return error.message
  return 'An unexpected error occurred.'
}

/**
 * Restituisce errori API in formato Problem Details (RFC 9457).
 */
export function publicProblem(c: Context, input: PublicProblemInput): Response {
  const body: Record<string, unknown> = {
    type: normalizeProblemType(input.type),
    title: input.title,
    status: input.status,
    detail: input.detail,
    instance: c.req.path,
  }
  if (input.errors && input.errors.length > 0) {
    body.errors = input.errors
  }
  return c.json(body, input.status, {
    'Content-Type': 'application/problem+json',
  })
}
