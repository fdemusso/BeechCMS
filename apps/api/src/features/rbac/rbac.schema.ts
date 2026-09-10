// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { z } from 'zod'
import { PERMISSIONS } from '@beechcms/core'

/** Same shape check `POST /auth/setup` applies; kept literal to avoid a shared-regex import. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** bcrypt silently truncates past 72 bytes, so the byte length is validated, not the char count. */
const passwordSchema = z
  .string()
  .min(8)
  .max(128)
  .refine(value => new TextEncoder().encode(value).length <= 72, {
    message: 'Password must not exceed 72 bytes when UTF-8 encoded.',
  })

/** The closed vocabulary, reused verbatim. A permission outside it cannot be parsed. */
export const permissionSchema = z.enum(PERMISSIONS)

export const createUserSchema = z.object({
  email: z.string().trim().max(254).regex(EMAIL_RE),
  password: passwordSchema,
  name: z.string().trim().max(120).nullish(),
  surname: z.string().trim().max(120).nullish(),
})

export const setActiveSchema = z.object({
  isActive: z.boolean(),
})

export const roleBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(400).nullish(),
  icon: z.string().trim().max(64).nullish(),
  /** At least one permission: a role granting nothing is a footgun, not a use case. */
  permissions: z.array(permissionSchema).min(1),
})

export const createAssignmentSchema = z.object({
  userId: z.string().min(1),
  roleId: z.string().min(1),
  /** `'*'` or a seeds.slug; existence is checked against the live registry in the handler. */
  scope: z.string().trim().min(1),
})

export const createInvitationSchema = z.object({
  email: z.string().trim().max(254).regex(EMAIL_RE),
  roleId: z.string().min(1),
  /** `'*'` or a seeds.slug; existence is checked against the live registry in the handler. */
  scope: z.string().trim().min(1),
  /** Email language. Anything unknown falls back to 'en' via resolveEmailLocale. */
  locale: z.string().trim().max(8).optional(),
})

export const acceptInvitationSchema = z.object({
  token: z.string().min(1).max(128),
  password: passwordSchema,
  name: z.string().trim().max(120).nullish(),
  surname: z.string().trim().max(120).nullish(),
})
