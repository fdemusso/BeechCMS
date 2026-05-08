/// <reference types="@cloudflare/workers-types" />
import type { Context } from 'hono'
import type { Env, Variables } from '../../types'
import { sendPasswordResetEmail, resolveEmailLocale } from '../email'
import { sha256hex } from '@beechcms/core'
import { getClientIp } from '../../shared/request-utils'

const PASSWORD_RESET_TOKEN_EXPIRY_SECONDS = 30 * 60

/**
 * Handles the password reset request.
 * Generates a reset token, stores its hash in the database, and sends an email to the user.
 */
export async function requestPasswordReset(
  context: Context<{ Bindings: Env; Variables: Variables }>
): Promise<Response> {
  const { env, req } = context

  if (!env.RESEND_API_KEY) {
    return context.json({ error: 'Service not available' }, 503)
  }

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return context.json({ error: 'Invalid request body' }, 400)
  }

  const emailInput = payload.email
  if (typeof emailInput !== 'string' || !emailInput.trim()) {
    return context.json({ error: 'Invalid request' }, 400)
  }

  const normalizedEmail = emailInput.trim().toLowerCase()
  const emailLocale = resolveEmailLocale(payload.locale)

  const clientIpAddress = getClientIp(req)
  const forgotPasswordRateLimit = await context.get('rateLimiters').getLimiter('forgotPassword').checkLimit(clientIpAddress)
  if (!forgotPasswordRateLimit.isAllowed) {
    return context.json({ error: 'Too many requests' }, 429)
  }

  // Always return 200 even when the user is not found to prevent user enumeration.
  const registeredUser = await context.get('userRepository').findByEmail(normalizedEmail)
  if (!registeredUser) {
    return context.json({ success: true })
  }

  const nowTimestamp = Math.floor(Date.now() / 1000)
  await context.get('passwordResetTokenRepository').invalidatePending(registeredUser.id, nowTimestamp)

  const resetToken = crypto.randomUUID()
  const tokenHash = await sha256hex(resetToken)
  const expiresAt = nowTimestamp + PASSWORD_RESET_TOKEN_EXPIRY_SECONDS

  await context.get('passwordResetTokenRepository').create({
    userId: registeredUser.id,
    tokenHash,
    expiresAt,
  })

  const baseUrl = (env.APP_URL ?? new URL(req.url).origin).replace(/\/$/, '')
  const resetUrl = `${baseUrl}/admin/reset-password?token=${resetToken}`

  try {
    await sendPasswordResetEmail({
      to: normalizedEmail,
      resetUrl,
      locale: emailLocale,
      apiKey: env.RESEND_API_KEY,
      from: env.EMAIL_FROM,
      isDev: env.ENV !== 'production',
    })
  } catch (error) {
    if (env.ENV !== 'production') {
      console.error('[password-reset] Failed to send email:', error)
    }
  }

  return context.json({ success: true })
}
