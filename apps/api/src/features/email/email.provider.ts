import type { OutboundEmail } from './email.types'

/**
 * EmailProvider — formal contract for email sending providers.
 *
 * Every implementation (Resend, SendGrid, Mailgun, SMTP, ...) MUST comply
 * with this interface. It is the only point of coupling between the email module and
 * any third-party external service.
 *
 * ─── HOW TO CHANGE PROVIDER ──────────────────────────────────────────────────
 *  1. Create a new file under `providers/` (e.g., `providers/sendgrid.ts`).
 *  2. Export a class that implements this interface.
 *  3. In `email.service.ts`, replace the import and instantiation of the current
 *     provider with your new class in the `createProvider()` function.
 *  4. Update the necessary environment variables in `types.ts` and `wrangler.jsonc`.
 *  5. No other file in the project needs to be touched.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export interface EmailProvider {
  /**
   * Sends a single transactional email.
   *
   * @param email - The fully resolved message: sender, recipient,
   *               subject, and HTML body. Use the builders in `templates/` to
   *               construct this object correctly.
   *
   * @returns Promise that resolves when the provider has **accepted** the
   *          message for delivery. Acceptance does not guarantee delivery
   *          to the inbox — that depends on the recipient's server and the
   *          provider's deliverability.
   *
   * @throws {Error} If the provider rejects the request (failed authentication,
   *                 network error, invalid payload). The caller
   *                 (`email.service.ts`) is responsible for catching and handling
   *                 this error appropriately.
   */
  send(email: OutboundEmail): Promise<void>
}
