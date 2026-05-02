/// <reference types="@cloudflare/workers-types" />
import type { Context } from 'hono'
import type { Env, Variables } from '../../types'
import { sendPasswordResetEmail, resolveEmailLocale } from '../email'

const TOKEN_EXPIRY_SECONDS = 30 * 60

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function requestPasswordReset(
  c: Context<{ Bindings: Env; Variables: Variables }>
): Promise<Response> {
  if (!c.env.RESEND_API_KEY) {
    return c.json({ error: 'Not available' }, 503)
  }

  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid request body' }, 400)
  }

  if (typeof body.email !== 'string' || !body.email.trim()) {
    return c.json({ error: 'Invalid request' }, 400)
  }

  const email = body.email.trim().toLowerCase()
  const locale = resolveEmailLocale(body.locale)

  if (c.env.FORGOT_PASSWORD_RATE_LIMITER) {
    const ip = c.req.raw.headers.get('cf-connecting-ip') ?? 'unknown'
    const { success } = await c.env.FORGOT_PASSWORD_RATE_LIMITER.limit({ key: ip })
    if (!success) {
      return c.json({ error: 'Too many requests' }, 429)
    }
  }

  // Sempre 200 per evitare user enumeration
  const user = await c.env.DB
    .prepare('SELECT id FROM users WHERE email = ?')
    .bind(email)
    .first<{ id: string }>()

  if (!user) {
    return c.json({ success: true })
  }

  // Invalida eventuali token pendenti per lo stesso utente prima di emetterne uno nuovo
  await c.env.DB
    .prepare('UPDATE password_reset_tokens SET used_at = unixepoch() WHERE user_id = ? AND used_at IS NULL')
    .bind(user.id)
    .run()

  const token = crypto.randomUUID()
  const tokenHash = await sha256hex(token)
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_SECONDS

  await c.env.DB
    .prepare('INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)')
    .bind(crypto.randomUUID(), user.id, tokenHash, expiresAt)
    .run()

  const appUrl = (c.env.APP_URL ?? new URL(c.req.url).origin).replace(/\/$/, '')
  const resetUrl = `${appUrl}/admin/reset-password?token=${token}`

  try {
    await sendPasswordResetEmail({
      to: email,
      resetUrl,
      locale,
      apiKey: c.env.RESEND_API_KEY,
      from: c.env.EMAIL_FROM,
      isDev: c.env.ENV !== 'production',
    })
  } catch (err) {
    if (c.env.ENV !== 'production') {
      console.error('[password-reset] invio email fallito:', err)
    }
  }

  return c.json({ success: true })
}
