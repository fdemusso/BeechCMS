/// <reference types="@cloudflare/workers-types" />
import type { Context } from 'hono'
import bcrypt from 'bcryptjs'
import type { Env, Variables } from '../../types'
import { sendPasswordChangedEmail, resolveEmailLocale } from '../email'

const MIN_PASSWORD_LENGTH = 8
const MAX_PASSWORD_LENGTH = 128

/**
 * Computes the SHA-256 hash of a string and returns it as a hex string.
 */
async function computeSha256Hash(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  
  return Array.from(new Uint8Array(hashBuffer))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Handles the actual password reset process using a valid token.
 */
export async function resetPassword(
  context: Context<{ Bindings: Env; Variables: Variables }>
): Promise<Response> {
  const { env, req, executionCtx } = context

  if (!env.RESEND_API_KEY) {
    return context.json({ error: 'Service not available' }, 503)
  }

  // Rate limiting: e.g., 5 attempts per IP per 60 seconds
  if (env.RESET_PASSWORD_RATE_LIMITER) {
    const clientIpAddress = req.raw.headers.get('cf-connecting-ip') ?? 'unknown'
    const { success: isRateLimitAllowed } = await env.RESET_PASSWORD_RATE_LIMITER.limit({ key: clientIpAddress })
    
    if (!isRateLimitAllowed) {
      return context.json({ error: 'Too many requests' }, 429)
    }
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
  if (
    typeof newPassword !== 'string' ||
    newPassword.length < MIN_PASSWORD_LENGTH ||
    newPassword.length > MAX_PASSWORD_LENGTH
  ) {
    return context.json({
      error: `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters`,
    }, 400)
  }

  const emailLocale = resolveEmailLocale(payload.locale)
  const hashedResetToken = await computeSha256Hash(resetToken)
  const currentTimestamp = Math.floor(Date.now() / 1000)

  // JOIN with users table to retrieve the email in a single query - needed for notification.
  const resetTokenRecord = await env.DB
    .prepare(
      `SELECT prt.id, prt.user_id, u.email
       FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
       WHERE prt.token_hash = ? AND prt.expires_at > ? AND prt.used_at IS NULL`,
    )
    .bind(hashedResetToken, currentTimestamp)
    .first<{ id: string; user_id: string; email: string }>()

  if (!resetTokenRecord) {
    return context.json({ error: 'Invalid or expired token' }, 400)
  }

  const hashedNewPassword = await bcrypt.hash(newPassword, 10)

  // Mark token as used, update user password, and revoke all active sessions - atomically.
  await env.DB.batch([
    env.DB
      .prepare('UPDATE password_reset_tokens SET used_at = unixepoch() WHERE id = ?')
      .bind(resetTokenRecord.id),
    env.DB
      .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .bind(hashedNewPassword, resetTokenRecord.user_id),
    env.DB
      .prepare('UPDATE refresh_tokens SET revoked_at = unixepoch() WHERE user_id = ? AND revoked_at IS NULL')
      .bind(resetTokenRecord.user_id),
  ])

  // Notify user that password was changed - fire-and-forget via waitUntil, doesn't block response.
  const sendNotification = async () => {
    try {
      await sendPasswordChangedEmail({
        to: resetTokenRecord.email,
        locale: emailLocale,
        apiKey: env.RESEND_API_KEY!,
        from: env.EMAIL_FROM,
        isDev: env.ENV !== 'production',
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

