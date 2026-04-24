# Email Module — Beech CMS

Complete documentation for the Beech CMS email module: architecture, configuration, and extension guide.

---

## Table of Contents

1. [Goals and principles](#1-goals-and-principles)
2. [Slice structure](#2-slice-structure)
3. [Send flow](#3-send-flow)
4. [Public API](#4-public-api)
5. [EmailProvider interface](#5-emailprovider-interface)
6. [Template system](#6-template-system)
   - [Shell (base layout)](#61-shell-base-layout)
   - [Specific templates](#62-specific-templates)
7. [Localisation](#7-localisation)
8. [Environment variables](#8-environment-variables)
9. [Developer recipes](#9-developer-recipes)
   - [Swap the provider](#91-swap-the-provider)
   - [Add a new email type](#92-add-a-new-email-type)
   - [Add a language](#93-add-a-language)
   - [Restyle all emails at once](#94-restyle-all-emails-at-once)

---

## 1. Goals and principles

The email module is a **fully self-contained vertical slice** of the Beech CMS backend. The rest of the project has no knowledge of Resend, HTML templates, or localisation logic. It communicates with the outside world through a single public API (`index.ts`) and a single formal interface (`EmailProvider`).

**Practical consequences:**

| What you want to do | Files to touch |
|---|---|
| Change the visual layout of all emails | Only `templates/shell.ts` |
| Change the copy of one specific email | Only the corresponding template file |
| Add a new language | `email.types.ts` + every `templates/*.ts` file |
| Replace Resend with another provider | `providers/<new>.ts` + one line in `email.service.ts` |
| Add a new email type | New `templates/<type>.ts` + new function in `email.service.ts` + export in `index.ts` |

None of these operations require touching the code that *calls* the module (e.g. `password-reset/`).

---

## 2. Slice structure

```
apps/api/src/features/email/
│
├── index.ts                   ← Public API: the only allowed import path from outside
│
├── email.provider.ts          ← Formal EmailProvider interface (the contract)
├── email.types.ts             ← Shared types + resolveEmailLocale
├── email.service.ts           ← Orchestrator; contains createProvider()
│
├── templates/
│   ├── shell.ts               ← Base HTML layout (single source of truth for branding)
│   ├── password-reset.ts      ← "Reset password link" email
│   └── password-changed.ts    ← "Password changed" security notification email
│
└── providers/
    └── resend.ts              ← Resend implementation of EmailProvider
```

**VSA dependency rule:** no file outside the slice ever imports from an internal path (e.g. `features/email/templates/shell`). Always import from `features/email` only, which resolves to `index.ts`.

---

## 3. Send flow

```
Caller (e.g. password-reset/request.ts)
    │
    │  import { sendPasswordResetEmail } from '../email'
    │  await sendPasswordResetEmail({ to, resetUrl, locale, apiKey, ... })
    ▼
email.service.ts  →  createProvider(apiKey, isDev)
    │                     └─ new ResendEmailProvider(apiKey, isDev)
    │
    ├─ buildPasswordResetEmail(resetUrl, locale)
    │       └─ COPY[locale]  +  buildEmailShell(locale, slots)
    │                                └─ complete HTML document
    │
    └─ provider.send({ from, to, subject, html })
            └─ POST https://api.resend.com/emails
```

The caller passes only what is strictly necessary (recipient, URL, locale, API key). Message composition, template selection, and transport protocol are all internal responsibilities of the module.

---

## 4. Public API

Always import from `'../email'` (or the relative path to `features/email`).

```typescript
import {
  sendPasswordResetEmail,   // sends the reset link email
  sendPasswordChangedEmail, // sends the "password changed" notification
  resolveEmailLocale,       // safely converts untrusted input to EmailLocale
  SUPPORTED_EMAIL_LOCALES,  // ['en', 'it'] — array of supported languages
} from '../email'

import type {
  EmailLocale,                  // 'en' | 'it'
  PasswordResetEmailParams,     // params shape for sendPasswordResetEmail
  PasswordChangedEmailParams,   // params shape for sendPasswordChangedEmail
} from '../email'
```

### `sendPasswordResetEmail(params)`

Sends the email containing the reset link. Behaves as a blocking call — throws if the provider rejects the request. The caller decides whether to propagate or swallow the error.

```typescript
await sendPasswordResetEmail({
  to: 'user@example.com',
  resetUrl: 'https://dashboard.example.com/reset-password?token=<uuid>',
  locale: 'it',                    // EmailLocale — use resolveEmailLocale() on external input
  apiKey: env.RESEND_API_KEY,      // string, already validated non-empty by the caller
  from: env.EMAIL_FROM,            // optional — default: 'Beech CMS <onboarding@resend.dev>'
  isDev: env.ENV !== 'production', // optional — enables provider error logging
})
```

### `sendPasswordChangedEmail(params)`

Sends the security notification. Same signature as `sendPasswordResetEmail` without `resetUrl`. Typically used as fire-and-forget via `waitUntil`.

### `resolveEmailLocale(raw)`

Converts any value (e.g. from a request body) to a valid `EmailLocale`, falling back to `'en'`.

```typescript
const locale = resolveEmailLocale(body.locale) // → 'en' | 'it'
```

---

## 5. EmailProvider interface

Defined in `email.provider.ts`. This is the formal contract that every provider implementation must fulfill.

```typescript
interface EmailProvider {
  send(email: OutboundEmail): Promise<void>
}

interface OutboundEmail {
  from: string     // RFC 5321 sender (e.g. "Beech CMS <noreply@beechcms.dev>")
  to: string[]     // recipient addresses
  subject: string
  html: string     // complete HTML document
}
```

**`send()` must:**
- Resolve when the provider has **accepted** the message for delivery (not when it is delivered to the inbox — that depends on the recipient's mail server).
- Throw an error for any provider rejection (authentication failure, network error, invalid payload).
- Never silently swallow errors — that responsibility belongs to the caller.

---

## 6. Template system

### 6.1 Shell (base layout)

`templates/shell.ts` exports `buildEmailShell(locale, slots)` — the shared HTML layout used by every email.

```typescript
interface EmailShellSlots {
  title: string       // H2 at the top of the card
  body: string        // main paragraph (safe inline HTML allowed)
  cta?: { label: string; href: string }  // optional CTA button
  warning?: string    // optional red warning paragraph (security alerts)
  footer: string      // small grey text at the bottom
}
```

Changing this function changes the visual appearance of **all** outgoing emails at once.

### 6.2 Specific templates

Each template is a file under `templates/` that:

1. Defines a `COPY: Record<EmailLocale, { ... }>` object with localised strings.
2. Exports a `build<EmailName>(params, locale)` function that combines `COPY[locale]` with `buildEmailShell()`.
3. Returns `{ subject: string; html: string }`.

```typescript
// Typical template structure
const COPY: Record<EmailLocale, {
  subject: string
  title: string
  body: string
  // ... other slots as needed
}> = {
  en: { ... },
  it: { ... },
}

export function buildMyEmail(locale: EmailLocale): { subject: string; html: string } {
  const c = COPY[locale]
  return {
    subject: c.subject,
    html: buildEmailShell(locale, { title: c.title, body: c.body, footer: c.footer }),
  }
}
```

---

## 7. Localisation

The localisation system works at two levels:

**1. Dashboard side (frontend):** `ForgotPasswordPage` and `ResetPasswordPage` send `i18n.language` in the `locale` field of the request body. The user sees the UI already in their language; the email arrives in the same language.

**2. API side (email module):** `resolveEmailLocale()` converts the received value to a safe `EmailLocale` with fallback to `'en'`. The service passes the locale to the templates, which select the corresponding copy from the `COPY` object.

The locale is never persisted in the database — it is transported in the HTTP request that triggers the send.

---

## 8. Environment variables

| Variable | Required | Description |
|---|---|---|
| `RESEND_API_KEY` | Yes (for email flow) | Resend API key. If absent, password reset endpoints return `503`. |
| `EMAIL_FROM` | No | Sender address in RFC 5321 format. Default: `Beech CMS <onboarding@resend.dev>` (Resend test sender, no verified domain required). Set a verified address in production. |
| `APP_URL` | No (but recommended) | Base URL of the dashboard. Used to build the reset link. Defaults to the API request origin — almost always wrong in production. |
| `FORGOT_PASSWORD_RATE_LIMITER` | No (dev) | Cloudflare rate limiter — 3 req/min per IP on the forgot-password endpoint. |
| `RESET_PASSWORD_RATE_LIMITER` | No (dev) | Cloudflare rate limiter — 5 req/min per IP on the reset-password endpoint. |

**Local development** — add to `apps/api/.dev.vars` (never commit this file):

```
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxx
APP_URL=http://localhost:5173
EMAIL_FROM=Beech CMS <onboarding@resend.dev>
```

**Production** — set via Wrangler secrets:

```bash
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put APP_URL
npx wrangler secret put EMAIL_FROM
```

---

## 9. Developer recipes

### 9.1 Swap the provider

**Example: replace Resend with SendGrid.**

**Step 1** — Create `providers/sendgrid.ts`:

```typescript
import type { EmailProvider } from '../email.provider'
import type { OutboundEmail } from '../email.types'

export class SendGridEmailProvider implements EmailProvider {
  private readonly apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async send(email: OutboundEmail): Promise<void> {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: email.to.map(e => ({ email: e })) }],
        from: { email: email.from },
        subject: email.subject,
        content: [{ type: 'text/html', value: email.html }],
      }),
    })
    if (!response.ok) {
      throw new Error(`[SendGridEmailProvider] HTTP ${response.status}`)
    }
  }
}
```

**Step 2** — In `email.service.ts`, update `createProvider()`:

```typescript
// Before:
import { ResendEmailProvider } from './providers/resend'
function createProvider(apiKey: string, isDev: boolean): EmailProvider {
  return new ResendEmailProvider(apiKey, isDev)
}

// After:
import { SendGridEmailProvider } from './providers/sendgrid'
function createProvider(apiKey: string, _isDev: boolean): EmailProvider {
  return new SendGridEmailProvider(apiKey)
}
```

**Step 3** — Rename `RESEND_API_KEY` → `SENDGRID_API_KEY` in `types.ts` and `wrangler.jsonc`.

No other file in the project needs to change.

---

### 9.2 Add a new email type

**Example: welcome email on first login.**

**Step 1** — Create `templates/welcome.ts`:

```typescript
import type { EmailLocale } from '../email.types'
import { buildEmailShell } from './shell'

const COPY: Record<EmailLocale, {
  subject: string; title: string; body: string; footer: string
}> = {
  en: {
    subject: 'Welcome to Beech CMS',
    title: 'Welcome!',
    body: 'Your account is ready. Start creating content from the dashboard.',
    footer: 'You are receiving this because you just created a Beech CMS account.',
  },
  it: {
    subject: 'Benvenuto in Beech CMS',
    title: 'Benvenuto!',
    body: 'Il tuo account è pronto. Inizia a creare contenuti dalla dashboard.',
    footer: 'Stai ricevendo questa email perché hai appena creato un account Beech CMS.',
  },
}

export function buildWelcomeEmail(locale: EmailLocale): { subject: string; html: string } {
  const c = COPY[locale]
  return {
    subject: c.subject,
    html: buildEmailShell(locale, { title: c.title, body: c.body, footer: c.footer }),
  }
}
```

**Step 2** — Add the function in `email.service.ts`:

```typescript
import { buildWelcomeEmail } from './templates/welcome'
import type { BaseEmailParams } from './email.types'

export async function sendWelcomeEmail(params: BaseEmailParams): Promise<void> {
  const provider = createProvider(params.apiKey, params.isDev ?? false)
  const { subject, html } = buildWelcomeEmail(params.locale)
  await provider.send({ from: params.from ?? DEFAULT_FROM, to: [params.to], subject, html })
}
```

**Step 3** — Export from `index.ts`:

```typescript
export { sendPasswordResetEmail, sendPasswordChangedEmail, sendWelcomeEmail } from './email.service'
```

---

### 9.3 Add a language

**Example: add French.**

**Step 1** — In `email.types.ts`:

```typescript
export const SUPPORTED_EMAIL_LOCALES = ['en', 'it', 'fr'] as const
```

**Step 2** — TypeScript will immediately flag every `templates/*.ts` file where the `'fr'` key is missing from the `COPY` object. Add it to each one.

**Step 3** — In the dashboard, add `'fr'` as a supported language in `i18n.ts` and provide translations in `locales/fr.json`.

---

### 9.4 Restyle all emails at once

Open `templates/shell.ts` and edit `buildEmailShell`. Any change propagates automatically to every outgoing email.

**Common examples:**

```typescript
// Change the CTA button colour (black → brand blue)
// Before:  background:#111
// After:   background:#2563eb

// Add a logo at the top of the card
// Insert before the <h2> tag:
// <img src="https://..." alt="Beech CMS" style="height:32px;margin-bottom:24px">

// Change the background colour
// Before:  background:#f9f9f9
// After:   background:#f0f4ff
```
