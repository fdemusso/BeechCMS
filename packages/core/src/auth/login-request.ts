// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { z } from 'zod'
import { isValidAccountEmail } from './account-email.js'

/** Same bounds the setup and reset-password flows enforce, so a password that can be created can log in. */
export const LOGIN_PASSWORD_MIN_LENGTH = 8
export const LOGIN_PASSWORD_MAX_LENGTH = 128

/** bcrypt silently truncates at 72 bytes; refusing longer input stops two passwords sharing a hash. */
export const LOGIN_PASSWORD_MAX_BYTES = 72

/**
 * Body of `POST /auth/login`. The single source of both the runtime check and the type the typed
 * client sends: the output email is already trimmed and lowercased, the form it is stored in.
 */
export const loginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().refine(isValidAccountEmail),
  password: z
    .string()
    .min(LOGIN_PASSWORD_MIN_LENGTH)
    .max(LOGIN_PASSWORD_MAX_LENGTH)
    .refine((password) => new TextEncoder().encode(password).length <= LOGIN_PASSWORD_MAX_BYTES),
})

export type LoginRequest = z.input<typeof loginRequestSchema>
