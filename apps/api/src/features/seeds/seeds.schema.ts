// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { z } from 'zod'
import type { Branch, BranchType, Seed } from '@beechcms/core'
import { BRANCH_ALIAS_RE, reservedBranchAliasReason, SLUG_RE } from '@beechcms/core'

/** Details the 400 problems carry; the dashboard shows them, so they are part of the contract. */
export const BODY_NOT_JSON_DETAIL = 'Body must be valid JSON.'
export const BODY_NOT_OBJECT_DETAIL = 'Body must be a JSON object.'
export const SLUG_DETAIL = `slug must match ${SLUG_RE.source}.`
export const NEW_ALIAS_DETAIL = `newAlias must match ${BRANCH_ALIAS_RE.source} (lowercase letter followed by alphanumeric characters or underscores).`

/** Every `BranchType`, so a retype can name one. `satisfies` keeps the list a subset of the union. */
export const BRANCH_TYPES = [
  'text', 'number', 'boolean', 'date', 'json', 'richtext', 'file', 'tags', 'relation', 'repeater',
] as const satisfies readonly BranchType[]
export const NEW_TYPE_DETAIL = `newType must be one of: ${BRANCH_TYPES.join(', ')}.`

/** A branch as a client may send it when appending: the server mints the id when it is absent. */
export type BranchDraft = Omit<Branch, 'id'> & { id?: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * The confirmation field of a destructive body. Typed `string` so the client has to send it, but
 * accepted whatever it holds: the token it must equal (`<slug>.<alias>`) depends on a record the
 * handler has not loaded yet, and the old order (resource 404/409 first, confirmation 400 last)
 * is part of the contract. `requireConfirm` is the check. A missing key must pass too, hence the
 * `optional()` that the cast hides from the inferred request type.
 */
const confirmField = z.custom<string>().optional() as unknown as z.ZodType<string>

/**
 * Body of `DELETE /:slug/hard`, `DELETE /:slug/branches/:branchId` and `DELETE /:slug/orphans/:column`.
 * Any JSON passes here (`null`, an array, a number): `requireConfirm` answers 400 `confirmation-required`
 * for all of them, as it always did. Only a body that is not JSON at all is refused earlier.
 */
export const confirmBodySchema = z.custom<{ confirm: string }>()

/** Body of `POST /` and `PUT /:slug`: a JSON object. The seed's own rules are `validateSeedDefinitions`'s job. */
export const seedBodySchema = z.custom<Seed>(isRecord, { error: BODY_NOT_OBJECT_DETAIL })

/**
 * Body of `POST /`. Same as {@link seedBodySchema} plus the slug, which names the table: the first
 * issue is the first thing the handler used to refuse.
 */
export const createSeedBodySchema = z
  .custom<Seed>(isRecord, { error: BODY_NOT_OBJECT_DETAIL })
  .refine((seed) => isRecord(seed) && typeof seed.slug === 'string' && SLUG_RE.test(seed.slug), { error: SLUG_DETAIL })

/** Body of `POST /:slug/branches`: a JSON object describing the new branch. */
export const branchBodySchema = z.custom<BranchDraft>(isRecord, { error: BODY_NOT_OBJECT_DETAIL })

/**
 * Body of `PATCH /:slug/branches/:branchId/rename`. `newAlias` is checked before the seed is even
 * looked up, so it lives in the schema; `confirm` waits for the branch (see {@link confirmField}).
 * Every issue's message is the 400 detail.
 */
export const renameBranchBodySchema = z.object(
  {
    newAlias: z
      .string({ error: NEW_ALIAS_DETAIL })
      .regex(BRANCH_ALIAS_RE, { error: NEW_ALIAS_DETAIL })
      .superRefine((alias, ctx) => {
        const reserved = reservedBranchAliasReason(alias)
        if (reserved) ctx.addIssue({ code: 'custom', message: reserved })
      }),
    confirm: confirmField,
  },
  { error: NEW_ALIAS_DETAIL },
)

/** Body of `PATCH /:slug/branches/:branchId/retype`; `confirm` waits for the branch like in rename. */
export const retypeBranchBodySchema = z.object(
  {
    newType: z.enum(BRANCH_TYPES, { error: NEW_TYPE_DETAIL }),
    confirm: confirmField,
  },
  { error: NEW_TYPE_DETAIL },
)
