/// <reference types="@cloudflare/workers-types" />
import type { Context } from 'hono'
import type { Env, Variables } from '../../types'

const TOKEN_EXPIRY_SECONDS = 30 * 60

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

const EMAIL_COPY = {
  en: {
    subject: 'Reset your Beech CMS password',
    title: 'Reset your password',
    body: 'You requested a password reset for your Beech CMS account. Click the button below to set a new password. This link expires in 30 minutes.',
    button: 'Reset password',
    footer: "If you didn't request this, you can safely ignore this email.",
  },
  it: {
    subject: 'Reimposta la tua password Beech CMS',
    title: 'Reimposta la tua password',
    body: 'Hai richiesto il reset della password per il tuo account Beech CMS. Clicca il pulsante qui sotto per impostare una nuova password. Questo link scade tra 30 minuti.',
    button: 'Reimposta password',
    footer: 'Se non hai richiesto questo, puoi ignorare questa email in tutta sicurezza.',
  },
} as const

type SupportedLocale = keyof typeof EMAIL_COPY

function resolveLocale(raw: unknown): SupportedLocale {
  if (typeof raw === 'string' && raw in EMAIL_COPY) return raw as SupportedLocale
  return 'en'
}

function buildResetEmailHtml(resetUrl: string, locale: SupportedLocale): string {
  const c = EMAIL_COPY[locale]
  return `<!DOCTYPE html>
<html lang="${locale}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:sans-serif;background:#f9f9f9;margin:0;padding:32px">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:8px;padding:32px;border:1px solid #e5e5e5">
    <h2 style="margin:0 0 16px;font-size:20px;color:#111">${c.title}</h2>
    <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.5">${c.body}</p>
    <a href="${resetUrl}"
       style="display:inline-block;background:#111;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:15px;font-weight:500">
      ${c.button}
    </a>
    <p style="margin:24px 0 0;color:#999;font-size:13px">${c.footer}</p>
  </div>
</body>
</html>`
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
  const locale = resolveLocale(body.locale)

  // Rate limiting
  if (c.env.FORGOT_PASSWORD_RATE_LIMITER) {
    const ip = c.req.raw.headers.get('cf-connecting-ip') ?? 'unknown'
    const { success } = await c.env.FORGOT_PASSWORD_RATE_LIMITER.limit({ key: ip })
    if (!success) {
      return c.json({ error: 'Too many requests' }, 429)
    }
  }

  // Always respond 200 to avoid user enumeration
  const user = await c.env.DB
    .prepare('SELECT id FROM users WHERE email = ?')
    .bind(email)
    .first<{ id: string }>()

  if (!user) {
    return c.json({ success: true })
  }

  // Revoke any existing pending tokens for this user
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
  const resetUrl = `${appUrl}/reset-password?token=${token}`
  const from = c.env.EMAIL_FROM ?? 'Beech CMS <onboarding@resend.dev>'

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${c.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: EMAIL_COPY[locale].subject,
      html: buildResetEmailHtml(resetUrl, locale),
    }),
  })

  if (!res.ok && c.env.ENV !== 'production') {
    console.error('Resend error:', await res.text())
  }

  return c.json({ success: true })
}
