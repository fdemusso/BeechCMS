// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { z } from 'zod'

/** Body of `POST /auth/forgot-password`. */
export interface ForgotPasswordRequest {
  email: string
  /** UI language of the email; anything `resolveEmailLocale` does not know falls back to the default. */
  locale?: string
}

/** Body of `POST /auth/reset-password`. */
export interface ResetPasswordRequest {
  token: string
  password: string
  locale?: string
}

/**
 * Valid JSON of another shape (`null`, an array, a number, a string) is a client error, not a
 * crash: the handlers read properties off the body immediately and `JSON.parse('null')` succeeds.
 */
const isJsonObject = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Bodies of the two routes. They type the request for `hc` and refuse only what is not a JSON
 * object; every field is judged by the handler, in the order of its own checks, because each
 * refusal there carries its own message and the first one decides which limiter is charged.
 */
export const forgotPasswordBodySchema = z.custom<ForgotPasswordRequest>(isJsonObject)
export const resetPasswordBodySchema = z.custom<ResetPasswordRequest>(isJsonObject)
