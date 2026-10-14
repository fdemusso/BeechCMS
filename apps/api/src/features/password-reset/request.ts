// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { Context } from 'hono'
import type { Env, Variables } from '../../types'
import { sendPasswordResetEmail, resolveEmailLocale } from '../../shared/email'
import { sha256hex } from '@beechcms/core'
import { getClientIp } from '../../shared/utils/request-utils'
import { checkDualKeyRateLimit, normalizeAccountKey } from '../../shared/utils/dual-key-rate-limiter'
import { readJsonObject } from './read-json-object'

type PasswordResetContext = Context<{ Bindings: Env; Variables: Variables }>

const PASSWORD_RESET_TOKEN_EXPIRY_SECONDS = 30 * 60
/** RFC 5321 path limit; the account limiter keys its buckets on this string, so it must stay bounded. */
const MAX_EMAIL_LENGTH = 254

/** Rejects a malformed request after charging the IP bucket, so junk bodies cannot be replayed for free. */
async function rejectInvalidRequest(
  context: PasswordResetContext,
  clientIpAddress: string,
  errorMessage: string
): Promise<Response> {
  const ipLimit = await context.get('rateLimiters').getLimiter('forgotPassword').checkLimit(clientIpAddress)
  if (!ipLimit.isAllowed) {
    const headers: Record<string, string> = {}
    if (ipLimit.retryAfterSeconds !== undefined) {
      headers['Retry-After'] = String(ipLimit.retryAfterSeconds)
    }
    return context.json({ error: 'Too many requests' }, 429, headers)
  }
  return context.json({ error: errorMessage }, 400)
}

/**
 * Handles the password reset request.
 * Generates a reset token, stores its hash in the database, and sends an email to the user.
 */
export async function requestPasswordReset(
  context: PasswordResetContext
): Promise<Response> {
  const { env, req, executionCtx } = context

  const useSmtp = env.EMAIL_PROVIDER === 'smtp'
  if (!useSmtp && !env.RESEND_API_KEY) {
    return context.json({ error: 'Service not available' }, 503)
  }

  const clientIpAddress = getClientIp(req)

  const payload = await readJsonObject(req)
  if (!payload) {
    return rejectInvalidRequest(context, clientIpAddress, 'Invalid request body')
  }

  const emailInput = payload.email
  if (typeof emailInput !== 'string' || !emailInput.trim() || emailInput.length > MAX_EMAIL_LENGTH) {
    return rejectInvalidRequest(context, clientIpAddress, 'Invalid request')
  }

  const dualKeyResult = await checkDualKeyRateLimit({
    ipLimiter: context.get('rateLimiters').getLimiter('forgotPassword'),
    accountLimiter: context.get('rateLimiters').getLimiter('forgotPasswordAccount'),
    clientIp: clientIpAddress,
    accountKey: emailInput,
  })

  if (!dualKeyResult.isAllowed) {
    const headers: Record<string, string> = {}
    if (dualKeyResult.retryAfterSeconds !== undefined) {
      headers['Retry-After'] = String(dualKeyResult.retryAfterSeconds)
    }
    return context.json({ error: 'Too many requests' }, 429, headers)
  }

  const normalizedEmail = normalizeAccountKey(emailInput)
  const emailLocale = resolveEmailLocale(payload.locale)

  // Always return 200 even when the user is not found to prevent user enumeration. A deactivated
  // account gets the same answer and no token: it cannot log in, so a reset would only plant a
  // password that becomes live on reactivation.
  const registeredUser = await context.get('userRepository').findByEmail(normalizedEmail)
  if (!registeredUser || !registeredUser.isActive) {
    return context.json({ success: true })
  }

  const passwordResetTokenRepository = context.get('passwordResetTokenRepository')
  const idGenerator = context.get('idGenerator')
  const nowTimestamp = context.get('clock').nowSeconds()
  const baseUrl = (env.APP_URL ?? new URL(req.url).origin).replace(/\/$/, '')
  const smtpBaseUrl = env.SMTP_HOST
    ? `http://${env.SMTP_HOST}:${env.SMTP_PORT ?? '8025'}`
    : undefined

  const sendNotification = async (resetToken: string) => {
    try {
      await sendPasswordResetEmail({
        to: normalizedEmail,
        resetUrl: `${baseUrl}/admin/reset-password?token=${resetToken}`,
        locale: emailLocale,
        apiKey: env.RESEND_API_KEY ?? '',
        from: env.EMAIL_FROM,
        isDev: env.ENV !== 'production',
        provider: env.EMAIL_PROVIDER as 'smtp' | 'resend' | undefined,
        smtpBaseUrl,
      })
    } catch (error) {
      if (env.ENV !== 'production') {
        console.error('[password-reset] Failed to send email:', error)
      }
    }
  }

  // The known-account path must not outlast the unknown-account path before responding, so the
  // D1 writes run after the response alongside the email send.
  const issueTokenAndNotify = async () => {
    let resetToken: string
    try {
      await passwordResetTokenRepository.invalidatePending(registeredUser.id, nowTimestamp)
      resetToken = idGenerator.uuid()
      await passwordResetTokenRepository.create({
        userId: registeredUser.id,
        tokenHash: await sha256hex(resetToken),
        expiresAt: nowTimestamp + PASSWORD_RESET_TOKEN_EXPIRY_SECONDS,
      })
    } catch (error) {
      console.error('[password-reset] Failed to issue reset token:', error)
      return
    }
    await sendNotification(resetToken)
  }

  // Started once: re-running it after a failed waitUntil would burn the token it just mailed.
  const pendingWork = issueTokenAndNotify()
  try {
    executionCtx.waitUntil(pendingWork)
  } catch {
    // executionCtx might not be available in some testing environments; the work is already running
  }

  return context.json({ success: true })
}
