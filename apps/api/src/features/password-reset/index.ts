// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import type { Context, MiddlewareHandler } from 'hono'
import type { AppEnv } from '../../types'
import { getClientIp } from '../../shared/utils/request-utils'
import { zodJson } from '../../shared/utils/zod-json'
import { forgotPasswordBodySchema, resetPasswordBodySchema } from './password-reset.schema'
import { rejectInvalidRequest, requestPasswordReset } from './request'
import { resetPassword } from './reset'

/** Both routes need a mail transport: without one a reset link could never be delivered. */
const requireMailTransport: MiddlewareHandler<AppEnv> = async (context, next) => {
  const useSmtp = context.env.EMAIL_PROVIDER === 'smtp'
  if (!useSmtp && !context.env.RESEND_API_KEY) {
    return context.json({ error: 'Service not available' }, 503)
  }
  await next()
}

/** Charges the reset limiter before the body is read, so junk bodies cannot be replayed for free. */
const throttleReset: MiddlewareHandler<AppEnv> = async (context, next) => {
  const limit = await context.get('rateLimiters').getLimiter('resetPassword').checkLimit(getClientIp(context.req))
  if (!limit.isAllowed) {
    const headers: Record<string, string> = {}
    if (limit.retryAfterSeconds !== undefined) headers['Retry-After'] = String(limit.retryAfterSeconds)
    return context.json({ error: 'Too many requests' }, 429, headers)
  }
  await next()
}

function rejectInvalidForgotBody(context: Context<AppEnv>) {
  return rejectInvalidRequest(context, getClientIp(context.req), 'Invalid request body')
}

function rejectInvalidResetBody(context: Context<AppEnv>) {
  return context.json({ error: 'Invalid request body' }, 400)
}

/**
 * Registered as one method chain so the route types reach `AppType` (see `../../routes.ts`).
 * The order of the checks is the contract: mail transport, then the limiter, then the body.
 */
export const passwordResetApp = new Hono<AppEnv>()
  // Feature flag: lets the dashboard know whether to show the forgot-password link
  .get('/auth/features', (context) => {
    return context.json({ passwordReset: context.env.EMAIL_PROVIDER === 'smtp' || Boolean(context.env.RESEND_API_KEY) }, 200)
  })
  .post('/auth/forgot-password', requireMailTransport, zodJson(forgotPasswordBodySchema, rejectInvalidForgotBody), requestPasswordReset)
  .post('/auth/reset-password', requireMailTransport, throttleReset, zodJson(resetPasswordBodySchema, rejectInvalidResetBody), resetPassword)
