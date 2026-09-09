---
title: Email Module
description: Edge-native transactional email delivery and templating with Resend and custom providers.
---

# Email Module

The BeechCMS email module is an edge-native, self-contained system responsible for transactional notifications, password recovery workflows, and automated email actions.

Built as an extensible vertical slice, it decouples template rendering, branding, and multilingual copy from the underlying delivery provider—allowing you to use [Resend](https://resend.com/) out of the box or swap in any custom provider (SendGrid, Postmark, AWS SES, or SMTP).

## Architecture & Principles

The email slice enforces a clean separation of concerns:
- **Zero Provider Coupling**: The rest of BeechCMS interacts only with `features/email/index.ts` and knows nothing about HTML rendering or third-party APIs.
- **Unified Branding**: A shared `shell.ts` layout acts as the single source of truth for email styling, logos, and button design.
- **Multilingual by Design**: Email copy is strongly typed and automatically matches the user's dashboard language preference (`en`, `it`, etc.).

| Goal | Relevant File |
| :--- | :--- |
| **Change visual styles / branding for all emails** | `templates/shell.ts` |
| **Modify copy for a specific email** | Corresponding `templates/*.ts` |
| **Add a new language** | `email.types.ts` + `templates/*.ts` |
| **Swap provider (e.g. Resend → SendGrid / SMTP)** | Create `providers/<new>.ts` + register in `email.service.ts` |
| **Add a new email notification type** | `templates/<type>.ts` + export in `index.ts` |

## Module Structure

```
apps/api/src/features/email/
├── index.ts               # Public API entry point
├── email.provider.ts      # Formal EmailProvider contract
├── email.types.ts         # Shared types & locale resolver
├── email.service.ts       # Orchestrator & provider factory
├── templates/
│   ├── shell.ts           # Master HTML shell (branding & typography)
│   ├── password-reset.ts  # One-time password reset link email
│   └── password-changed.ts# Security confirmation notification
└── providers/
    ├── resend.ts          # Default Resend API implementation
    └── smtp.ts            # Local development SMTP provider (Mailpit)
```

## Delivery Pipeline

<p align="center">
  <img src="/images/email-delivery-pipeline.svg" alt="BeechCMS Email Delivery Pipeline" style="width: 100%; max-width: 840px; margin: 16px 0;" />
</p>

## Public API

Import email utilities directly from the module entry point:

```typescript
import {
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
  resolveEmailLocale,
  SUPPORTED_EMAIL_LOCALES,
} from '../email'
```

### `sendPasswordResetEmail`

Sends a secure one-time password reset link:

```typescript
await sendPasswordResetEmail({
  to: 'user@example.com',
  resetUrl: 'https://dashboard.example.com/admin/reset-password?token=xxxx',
  locale: 'it',                    // Auto-falls back to 'en' if unsupported
  apiKey: env.RESEND_API_KEY,      // Provided by Worker environment
  from: env.EMAIL_FROM,            // Optional custom sender address
  isDev: env.ENV !== 'production',
})
```

### `sendPasswordChangedEmail`

Sends an immediate security alert when a password is changed:

```typescript
await sendPasswordChangedEmail({
  to: 'user@example.com',
  locale: 'en',
  apiKey: env.RESEND_API_KEY,
  from: env.EMAIL_FROM,
})
```

### `resolveEmailLocale`

Safely converts untrusted request input into a valid `EmailLocale`:

```typescript
const locale = resolveEmailLocale(requestBody.locale) // Returns 'en' | 'it'
```

## EmailProvider Contract

Every email transport implements the lightweight `EmailProvider` interface:

```typescript
export interface EmailProvider {
  send(email: OutboundEmail): Promise<void>
}

export interface OutboundEmail {
  from: string     // Sender address (e.g. "BeechCMS <noreply@example.com>")
  to: string[]     // Recipient email addresses
  subject: string  // Subject line
  html: string     // Complete HTML document
}
```

The `send()` method resolves once the message is accepted for delivery by the provider and throws on authentication or transmission errors.

## HTML Templates & Branding

### Shell Base Layout

All emails inherit their visual container from `buildEmailShell(locale, slots)` in `templates/shell.ts`:

```typescript
export interface EmailShellSlots {
  title: string
  body: string
  cta?: { label: string; href: string }
  warning?: string
  footer: string
}
```

Updating `shell.ts` changes colors, container widths, button border-radius, and footers across every email sent by the platform.

### Specific Email Templates

Individual templates pair localized text dictionaries (`COPY`) with the master shell:

```typescript
const COPY: Record<EmailLocale, { subject: string; title: string; body: string; footer: string }> = {
  en: {
    subject: 'Reset your BeechCMS password',
    title: 'Password Reset Request',
    body: 'Click the button below to set a new password for your account.',
    footer: 'If you did not request this, you can safely ignore this email.',
  },
  it: {
    subject: 'Reimposta la tua password su BeechCMS',
    title: 'Richiesta di reimpostazione password',
    body: 'Clicca sul pulsante sottostante per impostare una nuova password.',
    footer: 'Se non hai effettuato tu questa richiesta, puoi ignorare questo messaggio.',
  },
}
```

## Multilingual Support

- **Frontend Sync**: The React dashboard automatically passes the active user's language (`i18n.language`) when triggering password recovery.
- **Fallback Handling**: `resolveEmailLocale()` ensures unsupported locales fall back cleanly to English (`'en'`).
- **Zero Database Storage**: Locale preferences are passed ephemerally in request headers or body payloads.

## Environment Variables

| Variable | Required | Description |
| :--- | :---: | :--- |
| `RESEND_API_KEY` | In Production | [Resend](https://resend.com/) API Key for transactional email delivery. |
| `EMAIL_FROM` | Optional | Sender address (default: `Beech CMS <onboarding@resend.dev>`). Set a verified domain in production. |
| `APP_URL` | Recommended | Base URL of your dashboard (e.g. `https://my-site.com/admin`), used to build action links. |

Set secrets for local and production:

```bash
# Local development (.dev.vars)
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxx
APP_URL=http://localhost:8789

# Cloudflare Production
npx wrangler secret put RESEND_API_KEY --env production
```

## Customization Recipes

### Swapping Providers (e.g. SendGrid / SMTP)

To use SendGrid instead of Resend:

**1. Create `providers/sendgrid.ts`**:

```typescript
import type { EmailProvider } from '../email.provider'
import type { OutboundEmail } from '../email.types'

export class SendGridEmailProvider implements EmailProvider {
  constructor(private readonly apiKey: string) {}

  async send(email: OutboundEmail): Promise<void> {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: email.to.map((to) => ({ email: to })) }],
        from: { email: email.from },
        subject: email.subject,
        content: [{ type: 'text/html', value: email.html }],
      }),
    })
    if (!res.ok) throw new Error(`[SendGrid] Delivery failed: HTTP ${res.status}`)
  }
}
```

**2. Update `email.service.ts`**:

```typescript
import { SendGridEmailProvider } from './providers/sendgrid'

function createProvider(apiKey: string): EmailProvider {
  return new SendGridEmailProvider(apiKey)
}
```

### Adding New Email Types

1. Create `templates/welcome.ts` defining your localized copy and returning `{ subject, html }`.
2. Add a `sendWelcomeEmail(params)` function in `email.service.ts`.
3. Export it in `index.ts`.

### Adding Languages

1. Add the new locale code in `email.types.ts` (`export const SUPPORTED_EMAIL_LOCALES = ['en', 'it', 'es'] as const`).
2. TypeScript will automatically highlight every `templates/*.ts` file that requires the new language key in its `COPY` dictionary.

### Customizing Visual Styles

Open `templates/shell.ts` and modify colors, font-family, logo URLs, or button gradients. Changes apply immediately to all outgoing emails.
