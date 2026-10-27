// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { z } from 'zod'
import { isLocaleCode, isValidAccountEmail, isValidRetentionDays } from '@beechcms/core'

/** Upper bound on content locales: each localized value holds one validated value per locale. */
export const MAX_LOCALES = 50
export const STORAGE_ORPHAN_PAGE_LIMIT = 50

const MIN_PASSWORD_LENGTH = 8
const MAX_PASSWORD_LENGTH = 128
/** bcrypt hasha solo i primi 72 byte UTF-8; oltre viene ignorato silenziosamente */
const MAX_PASSWORD_BYTES = 72
const MAX_NAME_LENGTH = 100

export const PASSWORDS_REQUIRED_MESSAGE = 'Both currentPassword and newPassword are required'

function isUrl(value: string): boolean {
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

/**
 * Body of `PUT /settings`. The key order is the order the checks are reported in: the first issue
 * zod raises is the first thing the handler used to refuse. The stateful rule (the default locale
 * must be one of the locales) cannot live here and stays in the handler.
 */
export const updateSettingsRequestSchema = z.object({
  siteTitle: z.string().trim().optional(),
  defaultLanguage: z.string().trim().pipe(z.enum(['it', 'en'])).optional(),
  timezone: z.string().trim().optional(),
  currency: z.string().trim().optional(),
  company: z
    .object({
      name: z.string().trim().nullable().optional(),
      website: z.string().trim().refine((value) => value === '' || isUrl(value)).nullable().optional(),
      abbreviation: z.string().trim().nullable().optional(),
    })
    .nullable()
    .optional(),
  locales: z
    .array(z.string().refine(isLocaleCode))
    .min(1)
    .max(MAX_LOCALES)
    .refine((locales) => new Set(locales).size === locales.length)
    .optional(),
  defaultLocale: z.string().refine(isLocaleCode).optional(),
  trashRetentionDays: z.number().refine(isValidRetentionDays).optional(),
})

/** Body of `PUT /settings/profile`. At least one field must be present: the handler checks that. */
export const updateProfileRequestSchema = z.object({
  email: z.string().trim().toLowerCase().refine(isValidAccountEmail).optional(),
  name: z.string().trim().max(MAX_NAME_LENGTH).optional(),
  surname: z.string().trim().max(MAX_NAME_LENGTH).optional(),
})

const requiredPassword = z.string({ error: PASSWORDS_REQUIRED_MESSAGE }).min(1, PASSWORDS_REQUIRED_MESSAGE)

/** Body of `PUT /settings/password`. Each rule carries the message the endpoint answers with. */
export const changePasswordRequestSchema = z.object({
  currentPassword: requiredPassword,
  newPassword: requiredPassword
    .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`)
    .max(MAX_PASSWORD_LENGTH, 'Password is too long')
    .refine((password) => new TextEncoder().encode(password).length <= MAX_PASSWORD_BYTES, {
      error: `Password must not exceed ${MAX_PASSWORD_BYTES} bytes when UTF-8 encoded`,
    }),
})

/** Body of `PUT /settings/avatar`: the avatar URL, or `null` to clear it. */
export const updateAvatarRequestSchema = z.object({
  avatarUrl: z.string().trim().nullable(),
})

/** Body of `PUT /settings/notifications`. A preference left out is switched off. */
export const updateNotificationPrefsRequestSchema = z.object({
  contentCreate: z.boolean().default(false),
  contentUpdate: z.boolean().default(false),
  contentDelete: z.boolean().default(false),
  mediaUpload: z.boolean().default(false),
})

/** Body of `POST /settings/storage/orphans/delete`: 1..50 distinct, non-empty media keys. */
export const deleteOrphansRequestSchema = z.object({
  keys: z
    .array(z.string().min(1))
    .min(1)
    .max(STORAGE_ORPHAN_PAGE_LIMIT)
    .refine((keys) => new Set(keys).size === keys.length),
})

/**
 * Query of `GET /settings/storage`. Raw strings on purpose: the handler owns the numeric rules and
 * answers every bad value with the same pagination problem.
 */
export const storageQuerySchema = z.object({
  limit: z.string().optional(),
  offset: z.string().optional(),
})
