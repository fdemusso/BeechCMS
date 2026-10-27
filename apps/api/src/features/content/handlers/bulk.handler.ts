// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Context } from 'hono'
import type { z } from 'zod'
import {
  isEffectivelyEmpty,
  isLocalizedBranch,
  resolvePolicies,
  validateAndSanitizeSeedPayload,
  type BulkFieldUpdate,
} from '@beechcms/core'
import { publicProblem } from '../../../public/errors/problem-details'
import { contentValidationProblem } from './helpers'
import { CONTENT_ERRORS } from '../constants'
import { AppEnv } from '../../../types'
import type { ZodJsonInput, ZodJsonRefusal } from '../../../shared/utils/zod-json'
import type { contentBulkBodySchema } from '../crud.schema'

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

/**
 * A refused bulk body: not JSON at all is `content-invalid-json`; otherwise the first issue of
 * `contentBulkBodySchema` says which check failed. `ids` that are too many (the schema's only
 * `custom` issue on `ids`) is `bulk-size-exceeded`, any other `ids` problem (including a body that
 * is not an object) is `bulk-invalid-ids`, and `fields` is `bulk-invalid-fields`.
 */
export function rejectInvalidBulkBody(context: Context, error: z.ZodError, cause: ZodJsonRefusal) {
  if (cause === 'malformed') {
    return publicProblem(context, { type: 'content-invalid-json', title: 'Bad Request', status: 400, detail: CONTENT_ERRORS.INVALID_JSON_BODY })
  }
  const first = error.issues[0]
  if (first.path[0] === 'fields') {
    return publicProblem(context, { type: 'bulk-invalid-fields', title: 'Bad Request', status: 400, detail: 'fields must be an object with at least one key' })
  }
  if (first.code === 'custom') {
    return publicProblem(context, { type: 'bulk-size-exceeded', title: 'Bad Request', status: 400, detail: CONTENT_ERRORS.BULK_SIZE_EXCEEDED })
  }
  return publicProblem(context, { type: 'bulk-invalid-ids', title: 'Bad Request', status: 400, detail: 'ids must be a non-empty array of strings' })
}

export async function bulkHandler(context: Context<AppEnv, '/:slug/bulk', ZodJsonInput<typeof contentBulkBodySchema>>) {
  const slug = context.req.param('slug')

  const seed = context.get('getSeed')(slug)
  if (!seed) {
    return publicProblem(context, {
      type: 'content-seed-not-found',
      title: 'Not Found',
      status: 404,
      detail: CONTENT_ERRORS.SEED_NOT_FOUND,
    })
  }

  const { ids, fields: fieldsRaw } = context.req.valid('json')

  // ── Validate fields ───────────────────────────────────────────────────────────

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
    if (policies.visibility === 'hidden' || policies.privacy !== 'plain') {
      return publicProblem(context, {
        type: 'field-not-bulk-editable',
        title: 'Bad Request',
        status: 400,
        detail: `Field '${alias}' cannot be bulk-edited (hidden or non-plain privacy)`,
      })
    }

    // Bulk writes are blind per-row UPDATEs: a value here would replace every stored translation.
    if (isLocalizedBranch(branch)) {
      return publicProblem(context, {
        type: 'field-not-bulk-editable',
        title: 'Bad Request',
        status: 400,
        detail: `Field '${alias}' is localized and cannot be bulk-edited`,
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

  // ── Validate + sanitize 'set' values (same gate as PUT /:slug/:id) ───────────
  const setPayload: Record<string, unknown> = {}
  for (const [alias, update] of Object.entries(resolvedFields)) {
    if (update.kind === 'set') setPayload[alias] = update.value
  }

  if (Object.keys(setPayload).length > 0) {
    const validation = validateAndSanitizeSeedPayload(seed, setPayload, {
      operation: 'update',
      allowNull: true,
      requireAtLeastOneValidField: true,
      enforceRequiredFields: false,
      idGenerator: context.get('idGenerator'),
    })

    if (validation.dangerousFields.length > 0) {
      return publicProblem(context, {
        type: 'content-dangerous-content',
        title: 'Unprocessable Entity',
        status: 422,
        detail: `Content rejected: dangerous markup detected in field '${validation.dangerousFields[0]}'`,
      })
    }

    const requiredCleared = seed.branches
      .filter((b) => b.requiredOnUpdate && Object.hasOwn(setPayload, b.alias))
      .filter((b) => isEffectivelyEmpty(validation.data[b.alias], b.type))
      .map((b) => ({
        field: b.alias,
        expected: 'required-field',
        received: 'empty',
        message: `Field '${b.alias}' cannot be empty for update`,
      }))
    const details = [...validation.details, ...requiredCleared]
    if (details.length > 0) return contentValidationProblem(context, details)

    for (const [alias, value] of Object.entries(validation.data)) {
      resolvedFields[alias] = { kind: 'set', value }
    }
  }

  // ── Execute ───────────────────────────────────────────────────────────────────
  const repository = context.get('repository')
  const { updated, failed } = await repository.bulkUpdate(seed, ids, resolvedFields)

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
      name: [jwtPayload.name, jwtPayload.surname].filter(Boolean).join(' ') || null,
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

  return context.json({ updated, failed: failedProblems }, 200)
}
