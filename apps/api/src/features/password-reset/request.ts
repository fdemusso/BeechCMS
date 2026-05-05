/// <reference types="@cloudflare/workers-types" />
import type { Context } from 'hono'
import type { Env, Variables } from '../../types'
import { sendPasswordResetEmail, resolveEmailLocale } from '../email'

const PASSWORD_RESET_TOKEN_EXPIRY_SECONDS = 30 * 60

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

  // Rate limiting based on IP address
  if (env.FORGOT_PASSWORD_RATE_LIMITER) {
    const clientIpAddress = req.raw.headers.get('cf-connecting-ip') ?? 'unknown'
    const { success: isRateLimitAllowed } = await env.FORGOT_PASSWORD_RATE_LIMITER.limit({ key: clientIpAddress })
    
    if (!isRateLimitAllowed) {
      return context.json({ error: 'Too many requests' }, 429)
    }
  }

  // Find user by email. We always return 200 success even if the user is not found to prevent user enumeration.
  const registeredUser = await env.DB
    .prepare('SELECT id FROM users WHERE email = ?')
    .bind(normalizedEmail)
    .first<{ id: string }>()

  if (!registeredUser) {
    return context.json({ success: true })
  }

  // Invalidate any existing pending tokens for the same user before issuing a new one.
  await env.DB
    .prepare('UPDATE password_reset_tokens SET used_at = unixepoch() WHERE user_id = ? AND used_at IS NULL')
    .bind(registeredUser.id)
    .run()

  const resetToken = crypto.randomUUID()
  const hashedResetToken = await computeSha256Hash(resetToken)
  const expirationTimestamp = Math.floor(Date.now() / 1000) + PASSWORD_RESET_TOKEN_EXPIRY_SECONDS

  // Store the hashed token in the database
  await env.DB
    .prepare('INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)')
    .bind(crypto.randomUUID(), registeredUser.id, hashedResetToken, expirationTimestamp)
    .run()

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
    // Only log errors in non-production environments
    if (env.ENV !== 'production') {
      console.error('[password-reset] Failed to send email:', error)
    }
  }

  return context.json({ success: true })
}

