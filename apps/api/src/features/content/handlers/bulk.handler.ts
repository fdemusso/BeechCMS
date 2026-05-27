// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Context } from 'hono'
import { resolvePolicies, type BulkFieldUpdate } from '@beechcms/core'
import { publicProblem } from '../../../public/problem-details'
import { CONTENT_ERRORS } from '../constants'
import { AppEnv } from '../../../types'

const MAX_BULK_SIZE = 500

const MULTI_REL_MODES = ['replace', 'add', 'remove'] as const
type MultiRelMode = (typeof MULTI_REL_MODES)[number]

interface MultiRelWrapper {
  mode: MultiRelMode
  value: string[]
}

function isMultiRelWrapper(v: unknown): v is MultiRelWrapper {
  if (typeof v !== 'object' || v === null) return false
  const obj = v as Record<string, unknown>
  return (
    MULTI_REL_MODES.includes(obj.mode as MultiRelMode) &&
    Array.isArray(obj.value) &&
    (obj.value as unknown[]).every((x) => typeof x === 'string')
  )
}

export async function bulkHandler(context: Context<AppEnv>) {
  const slug = context.req.param('slug')
  if (!slug) {
    return publicProblem(context, {
      type: 'content-invalid-slug-or-id',
      title: 'Bad Request',
      status: 400,
      detail: CONTENT_ERRORS.INVALID_SLUG_OR_ID,
    })
  }

  const seed = context.get('getSeed')(slug)
  if (!seed) {
    return publicProblem(context, {
      type: 'content-seed-not-found',
      title: 'Not Found',
      status: 404,
      detail: CONTENT_ERRORS.SEED_NOT_FOUND,
    })
  }

  let body: Record<string, unknown>
  try {
    body = await context.req.json<Record<string, unknown>>()
  } catch {
    return publicProblem(context, {
      type: 'content-invalid-json',
      title: 'Bad Request',
      status: 400,
      detail: CONTENT_ERRORS.INVALID_JSON_BODY,
    })
  }

  // ── Validate ids ─────────────────────────────────────────────────────────────
  const ids = body.ids
  if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => typeof id !== 'string')) {
    return publicProblem(context, {
      type: 'bulk-invalid-ids',
      title: 'Bad Request',
      status: 400,
      detail: 'ids must be a non-empty array of strings',
    })
  }

  if (ids.length > MAX_BULK_SIZE) {
    return publicProblem(context, {
      type: 'bulk-size-exceeded',
      title: 'Bad Request',
      status: 400,
      detail: `Cannot edit more than ${MAX_BULK_SIZE} entries at once`,
    })
  }

  // ── Validate fields ───────────────────────────────────────────────────────────
  const rawFields = body.fields
  if (
    typeof rawFields !== 'object' ||
    rawFields === null ||
    Array.isArray(rawFields) ||
    Object.keys(rawFields as object).length === 0
  ) {
    return publicProblem(context, {
      type: 'bulk-invalid-fields',
      title: 'Bad Request',
      status: 400,
      detail: 'fields must be an object with at least one key',
    })
  }

  const fieldsRaw = rawFields as Record<string, unknown>

  // Validate each alias exists on the seed and is not hidden/encrypt
  const resolvedFields: Record<string, BulkFieldUpdate> = {}

  for (const [alias, rawValue] of Object.entries(fieldsRaw)) {
    const branch = seed.branches.find((b) => b.alias === alias)
    if (!branch) {
      return publicProblem(context, {
        type: 'bulk-unknown-field',
        title: 'Bad Request',
        status: 400,
        detail: `Field '${alias}' does not exist on seed '${slug}'`,
      })
    }

    const policies = resolvePolicies(branch)
    if (policies.visibility === 'hidden' || policies.privacy === 'encrypt') {
      return publicProblem(context, {
        type: 'field-not-bulk-editable',
        title: 'Bad Request',
        status: 400,
        detail: `Field '${alias}' cannot be bulk-edited (hidden or encrypted)`,
      })
    }

    // Multi-relation branches accept a { mode, value } wrapper or a plain array (treated as replace)
    const branchAny = branch as { type: string; multiple?: boolean }
    if (branchAny.type === 'relation' && branchAny.multiple === true) {
      if (isMultiRelWrapper(rawValue)) {
        const kindMap: Record<MultiRelMode, BulkFieldUpdate['kind']> = {
          replace: 'array_replace',
          add: 'array_add',
          remove: 'array_remove',
        }
        resolvedFields[alias] = { kind: kindMap[rawValue.mode], value: rawValue.value }
      } else if (Array.isArray(rawValue) && (rawValue as unknown[]).every((x) => typeof x === 'string')) {
        resolvedFields[alias] = { kind: 'array_replace', value: rawValue as string[] }
      } else {
        return publicProblem(context, {
          type: 'bulk-invalid-field-value',
          title: 'Bad Request',
          status: 400,
          detail: `Field '${alias}' is a multi-relation and requires { mode, value } or a string array`,
        })
      }
    } else {
      resolvedFields[alias] = { kind: 'set', value: rawValue }
    }
  }

  // ── Execute ───────────────────────────────────────────────────────────────────
  const repository = context.get('repository')
  const { updated, failed } = await repository.bulkUpdate(slug, ids as string[], resolvedFields)

  // ── Activity log (single entry for the whole operation) ───────────────────────
  const jwtPayload = context.get('jwtPayload')
  context.get('activityLogger').log({
    action: 'bulk_update',
    entityType: 'content',
    entityId: slug,
    entitySlug: slug,
    details: { count: updated, fields: Object.keys(resolvedFields) },
    actor: {
      id: jwtPayload.sub,
      email: jwtPayload.email ?? 'unknown',
      name: jwtPayload.name ?? null,
    },
  })

  // ── Build structured failure objects ─────────────────────────────────────────
  const failedProblems = failed.map(({ id, reason }) => ({
    id,
    problem: {
      status: 422,
      type: reason.startsWith('relation-target-not-found')
        ? 'relation-target-not-found'
        : reason === 'not-found'
          ? 'content-not-found'
          : 'bulk-update-error',
      detail: reason,
    },
  }))

  return context.json({ updated, failed: failedProblems })
}
