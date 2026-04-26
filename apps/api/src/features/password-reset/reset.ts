/// <reference types="@cloudflare/workers-types" />
import type { Context } from 'hono'
import bcrypt from 'bcryptjs'
import type { Env, Variables } from '../../types'
import { sendPasswordChangedEmail, resolveEmailLocale } from '../email'

const MIN_PASSWORD_LENGTH = 8
const MAX_PASSWORD_LENGTH = 128

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function resetPassword(
  c: Context<{ Bindings: Env; Variables: Variables }>
): Promise<Response> {
  if (!c.env.RESEND_API_KEY) {
    return c.json({ error: 'Not available' }, 503)
  }

  // Rate limiting: 5 tentativi per IP per 60 secondi
  if (c.env.RESET_PASSWORD_RATE_LIMITER) {
    const ip = c.req.raw.headers.get('cf-connecting-ip') ?? 'unknown'
    const { success } = await c.env.RESET_PASSWORD_RATE_LIMITER.limit({ key: ip })
    if (!success) {
      return c.json({ error: 'Too many requests' }, 429)
    }
  }

  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid request body' }, 400)
  }

  if (typeof body.token !== 'string' || !body.token) {
    return c.json({ error: 'Invalid or expired token' }, 400)
  }

  if (
    typeof body.password !== 'string' ||
    body.password.length < MIN_PASSWORD_LENGTH ||
    body.password.length > MAX_PASSWORD_LENGTH
  ) {
    return c.json({
      error: `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters`,
    }, 400)
  }

  const locale = resolveEmailLocale(body.locale)
  const tokenHash = await sha256hex(body.token)
  const now = Math.floor(Date.now() / 1000)

  // JOIN users per recuperare l'email in un'unica query — serve per la notifica
  const record = await c.env.DB
    .prepare(
      `SELECT prt.id, prt.user_id, u.email
       FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
       WHERE prt.token_hash = ? AND prt.expires_at > ? AND prt.used_at IS NULL`,
    )
    .bind(tokenHash, now)
    .first<{ id: string; user_id: string; email: string }>()

  if (!record) {
    return c.json({ error: 'Invalid or expired token' }, 400)
  }

  const newHash = await bcrypt.hash(body.password, 10)

  // Segna token usato, aggiorna password, revoca tutte le sessioni — atomicamente
  await c.env.DB.batch([
    c.env.DB
      .prepare('UPDATE password_reset_tokens SET used_at = unixepoch() WHERE id = ?')
      .bind(record.id),
    c.env.DB
      .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .bind(newHash, record.user_id),
    c.env.DB
      .prepare('UPDATE refresh_tokens SET revoked_at = unixepoch() WHERE user_id = ? AND revoked_at IS NULL')
      .bind(record.user_id),
  ])

  // Notifica "password modificata" — fire-and-forget via waitUntil, non blocca il 200
  const notify = () =>
    sendPasswordChangedEmail({
      to: record.email,
      locale,
      apiKey: c.env.RESEND_API_KEY!,
      from: c.env.EMAIL_FROM,
      isDev: c.env.ENV !== 'production',
    }).catch((err) => {
      if (c.env.ENV !== 'production') {
        console.error('[password-reset] notifica email fallita:', err)
      }
    })

  try {
    c.executionCtx.waitUntil(notify())
  } catch {
    // executionCtx non disponibile in ambiente di test
    void notify()
  }

  return c.json({ success: true })
}
