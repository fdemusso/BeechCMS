/// <reference types="@cloudflare/workers-types" />
import type { Context } from 'hono'
import bcrypt from 'bcryptjs'
import type { Env, Variables } from '../../types'

const MIN_PASSWORD_LENGTH = 8
const MAX_PASSWORD_LENGTH = 128

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

const CHANGED_EMAIL_COPY = {
  en: {
    subject: 'Your Beech CMS password has been changed',
    title: 'Your password has been changed',
    body: 'Your Beech CMS account password was successfully changed. If you made this change, no action is needed.',
    warning: 'If you did not make this change, your account may be compromised. Contact your administrator immediately.',
    footer: 'This is an automated security notification. Do not reply to this email.',
  },
  it: {
    subject: 'La tua password Beech CMS è stata modificata',
    title: 'La tua password è stata modificata',
    body: 'La password del tuo account Beech CMS è stata modificata con successo. Se hai effettuato tu questa modifica, non devi fare nulla.',
    warning: 'Se non hai effettuato tu questa modifica, il tuo account potrebbe essere compromesso. Contatta immediatamente il tuo amministratore.',
    footer: 'Questa è una notifica di sicurezza automatica. Non rispondere a questa email.',
  },
} as const

type SupportedLocale = keyof typeof CHANGED_EMAIL_COPY

function resolveLocale(raw: unknown): SupportedLocale {
  if (typeof raw === 'string' && raw in CHANGED_EMAIL_COPY) return raw as SupportedLocale
  return 'en'
}

function buildPasswordChangedEmailHtml(locale: SupportedLocale): string {
  const c = CHANGED_EMAIL_COPY[locale]
  return `<!DOCTYPE html>
<html lang="${locale}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:sans-serif;background:#f9f9f9;margin:0;padding:32px">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:8px;padding:32px;border:1px solid #e5e5e5">
    <h2 style="margin:0 0 16px;font-size:20px;color:#111">${c.title}</h2>
    <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.5">${c.body}</p>
    <p style="margin:0 0 24px;color:#ef4444;font-size:15px;line-height:1.5;font-weight:500">${c.warning}</p>
    <p style="margin:0;color:#999;font-size:13px">${c.footer}</p>
  </div>
</body>
</html>`
}

export async function resetPassword(
  c: Context<{ Bindings: Env; Variables: Variables }>
): Promise<Response> {
  if (!c.env.RESEND_API_KEY) {
    return c.json({ error: 'Not available' }, 503)
  }

  // Rate limiting: 5 attempts per IP per 60 seconds
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
    return c.json({ error: `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters` }, 400)
  }

  const locale = resolveLocale(body.locale)
  const tokenHash = await sha256hex(body.token)
  const now = Math.floor(Date.now() / 1000)

  // JOIN users to fetch email in a single query — needed for the confirmation notification
  const record = await c.env.DB
    .prepare(
      `SELECT prt.id, prt.user_id, u.email
       FROM password_reset_tokens prt
       JOIN users u ON u.id = prt.user_id
       WHERE prt.token_hash = ? AND prt.expires_at > ? AND prt.used_at IS NULL`
    )
    .bind(tokenHash, now)
    .first<{ id: string; user_id: string; email: string }>()

  if (!record) {
    return c.json({ error: 'Invalid or expired token' }, 400)
  }

  const newHash = await bcrypt.hash(body.password, 10)

  // Mark token used, update password, revoke all sessions — atomically
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

  // Send "password changed" notification — fire-and-forget, never blocks the 200
  const sendNotification = async () => {
    try {
      const from = c.env.EMAIL_FROM ?? 'Beech CMS <onboarding@resend.dev>'
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${c.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [record.email],
          subject: CHANGED_EMAIL_COPY[locale].subject,
          html: buildPasswordChangedEmailHtml(locale),
        }),
      })
      if (!res.ok && c.env.ENV !== 'production') {
        console.error('Resend notification error:', await res.text())
      }
    } catch (err) {
      if (c.env.ENV !== 'production') {
        console.error('Failed to send password change notification:', err)
      }
    }
  }

  try {
    c.executionCtx.waitUntil(sendNotification())
  } catch {
    // executionCtx not available in test environment
    void sendNotification()
  }

  return c.json({ success: true })
}
