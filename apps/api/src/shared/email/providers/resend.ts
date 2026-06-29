// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { EmailProvider, OutboundEmail } from '@beechcms/core'

/** Resend REST endpoint for sending emails. */
const RESEND_API_URL = 'https://api.resend.com/emails'

/**
 * Resend implementation of EmailProvider.
 *
 * This is the ONLY file in the email module that knows about Resend.
 * Every other file is completely unaware of which provider is active.
 *
 * ─── HOW TO REPLACE THIS PROVIDER ──────────────────────────────────────────
 *  1. Create a new file in `providers/` (e.g., `providers/sendgrid.ts`).
 *  2. Export a class that implements `EmailProvider` (a single method: `send`).
 *  3. In `email.service.ts`, replace `new ResendEmailProvider(...)` with
 *     your new class in the `createProvider()` function.
 *  4. Update the environment variables in `types.ts` and `wrangler.jsonc`.
 *  5. No other file in the project needs to be modified.
 *
 * Resend API Documentation: https://resend.com/docs/api-reference/emails/send-email
 * ─────────────────────────────────────────────────────────────────────────────
 */
export class ResendEmailProvider implements EmailProvider {
  private readonly apiKey: string

  /** When `true`, errors are logged to the console (development only). */
  private readonly isDev: boolean

  constructor(apiKey: string, isDev = false) {
    this.apiKey = apiKey
    this.isDev = isDev
  }

  /**
   * Sends the email via the Resend REST API (`POST /emails`).
   *
   * Throws an exception if Resend responds with a non-2xx status, so that
   * the caller (`email.service.ts`) can decide whether to propagate the error
   * or handle it silently (fire-and-forget).
   *
   * The response body is read for logging only in the development environment,
   * to avoid unnecessarily consuming the body stream in production.
   */
  async send(email: OutboundEmail): Promise<void> {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        },
      body: JSON.stringify(email),
    })

    if (!response.ok) {
      const detail = this.isDev
        ? await response.text()
        : `HTTP ${response.status}`
      throw new Error(`[ResendEmailProvider] send failed — ${detail}`)
    }
  }
}
