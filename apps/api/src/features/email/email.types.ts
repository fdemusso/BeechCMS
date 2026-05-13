/**
 * Shared types for the Beech CMS email module.
 *
 * All types used across provider, service, and templates are defined here
 * so that each layer remains decoupled from the others.
 */

// ── Locale ────────────────────────────────────────────────────────────────────

/**
 * Supported languages for the email template system.
 *
 * To add a new language:
 *  1. Add the ISO code here (e.g., `'fr'`).
 *  2. Add the corresponding translation in the `COPY` object of every
 *     file in `templates/`. TypeScript will flag missing keys.
 */
export const SUPPORTED_EMAIL_LOCALES = ['en', 'it'] as const
export type EmailLocale = (typeof SUPPORTED_EMAIL_LOCALES)[number]

/**
 * Resolves an unverified locale string (e.g., from a request body)
 * to a supported `EmailLocale` value. Any unknown value
 * safely falls back to `'en'`.
 *
 * @param raw - Raw value from the client (can be anything).
 * @returns A valid `EmailLocale`, always.
 */
export function resolveEmailLocale(raw: unknown): EmailLocale {
  if (
    typeof raw === 'string' &&
    (SUPPORTED_EMAIL_LOCALES as readonly string[]).includes(raw)
  ) {
    return raw as EmailLocale
  }
  return 'en'
}

// ── Outbound message ──────────────────────────────────────────────────────────

/**
 * The resolved email message that the provider receives and sends.
 * It is constructed by the service by combining the call parameters
 * with the template builder output.
 */
export interface OutboundEmail {
  /** Sender address in RFC 5321 format (e.g., "Beech CMS <noreply@beechcms.dev>"). */
  from: string
  /** List of recipient addresses. Must contain at least one element. */
  to: string[]
  subject: string
  /** Complete HTML body. Must be a valid HTML document (see `templates/shell.ts`). */
  html: string
}

// ── Service function parameters ───────────────────────────────────────────────

/**
 * Shared parameters for every email sending function in `email.service.ts`.
 * Specific functions extend this type with the additional fields
 * required for their respective templates.
 */
export interface BaseEmailParams {
  /** Main recipient address. */
  to: string
  /** Email body language. Use `resolveEmailLocale()` before passing it here. */
  locale: EmailLocale
  /**
   * Resend API key (or the active provider's key). Must be non-empty —
   * the caller is responsible for validating it before invoking the service.
   */
  apiKey: string
  /**
   * Sender address in RFC 5321 format.
   * Default: "Beech CMS <onboarding@resend.dev>" (Resend test sender).
   * In production, set a verified address via the
   * `EMAIL_FROM` environment variable.
   */
  from?: string
  /**
   * When `true`, provider errors are logged to the console.
   * Set to `false` in production to avoid exposing internal details.
   */
  isDev?: boolean
}

/** Parameters for the password reset email — adds the reset URL. */
export interface PasswordResetEmailParams extends BaseEmailParams {
  /**
   * Complete URL that the user clicks to set the new password.
   * Contains the token in plain text as a query param `?token=<uuid>`.
   * Constructed by the caller as `${APP_URL}/reset-password?token=${token}`.
   */
  resetUrl: string
}

/** Parameters for the "password changed" notification. No additional fields. */
export type PasswordChangedEmailParams = BaseEmailParams

export interface AutomationMailParams {
  to: string
  subject: string
  /** Plain text or HTML — passed verbatim to provider. */
  body: string
  resendApiKey?: string
  from?: string
}
