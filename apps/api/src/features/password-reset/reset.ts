// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { Context } from 'hono'
import type { Env, Variables } from '../../types'
import { sendPasswordChangedEmail, resolveEmailLocale } from '../../shared/email'
import { sha256hex } from '@beechcms/core'
import { getClientIp } from '../../shared/utils/request-utils'

const MIN_PASSWORD_LENGTH = 8
const MAX_PASSWORD_LENGTH = 128
/** bcrypt hasha solo i primi 72 byte UTF-8; oltre viene ignorato silenziosamente */
const MAX_PASSWORD_BYTES = 72

/**
 * Handles the actual password reset process using a valid token.
 */
export async function resetPassword(
  context: Context<{ Bindings: Env; Variables: Variables }>
): Promise<Response> {
  const { env, req, executionCtx } = context

  const useSmtp = env.EMAIL_PROVIDER === 'smtp'
  if (!useSmtp && !env.RESEND_API_KEY) {
    return context.json({ error: 'Service not available' }, 503)
  }

  const clientIpAddress = getClientIp(req)
  const resetPasswordRateLimit = await context.get('rateLimiters').getLimiter('resetPassword').checkLimit(clientIpAddress)
  if (!resetPasswordRateLimit.isAllowed) {
    return context.json({ error: 'Too many requests' }, 429)
  }

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return context.json({ error: 'Invalid request body' }, 400)
  }

  const resetToken = payload.token
  if (typeof resetToken !== 'string' || !resetToken) {
    return context.json({ error: 'Invalid or expired token' }, 400)
  }

  const newPassword = payload.password
  const isPasswordInvalid =
    typeof newPassword !== 'string' ||
    newPassword.length < MIN_PASSWORD_LENGTH ||
    newPassword.length > MAX_PASSWORD_LENGTH

  if (isPasswordInvalid) {
    return context.json({
      error: `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters`,
    }, 400)
  }

  if (new TextEncoder().encode(newPassword as string).length > MAX_PASSWORD_BYTES) {
    return context.json({
      error: `Password must not exceed ${MAX_PASSWORD_BYTES} bytes when UTF-8 encoded`,
    }, 400)
  }

  const emailLocale = resolveEmailLocale(payload.locale)
  const tokenHash = await sha256hex(resetToken as string)
  const nowTimestamp = Math.floor(Date.now() / 1000)

  const tokenRecord = await context.get('passwordResetTokenRepository').findValidByHashWithEmail(tokenHash, nowTimestamp)
  if (!tokenRecord) {
    return context.json({ error: 'Invalid or expired token' }, 400)
  }

  const hashedNewPassword = await context.get('hashProvider').hash(newPassword as string)

  await context.get('passwordResetTokenRepository').markUsed(tokenRecord.id, nowTimestamp)
  await context.get('userRepository').updatePasswordHash(tokenRecord.userId, hashedNewPassword)
  await context.get('sessionRepository').revokeAllForUser(tokenRecord.userId, nowTimestamp)

  const smtpBaseUrl = env.SMTP_HOST
    ? `http://${env.SMTP_HOST}:${env.SMTP_PORT ?? '8025'}`
    : undefined
  const sendNotification = async () => {
    try {
      await sendPasswordChangedEmail({
        to: tokenRecord.email,
        locale: emailLocale,
        apiKey: env.RESEND_API_KEY ?? '',
        from: env.EMAIL_FROM,
        isDev: env.ENV !== 'production',
        provider: env.EMAIL_PROVIDER as 'smtp' | 'resend' | undefined,
        smtpBaseUrl,
      })
    } catch (error) {
      if (env.ENV !== 'production') {
        console.error('[password-reset] Failed to send password change notification:', error)
      }
    }
  }

  try {
    executionCtx.waitUntil(sendNotification())
  } catch {
    // executionCtx might not be available in some testing environments
    void sendNotification()
  }

  return context.json({ success: true })
}
