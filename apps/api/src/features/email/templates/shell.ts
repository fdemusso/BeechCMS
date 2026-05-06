import type { EmailLocale } from '../email.types'

/**
 * Content slots that every template must provide to compose a complete email.
 * Each slot corresponds to a visual block in the email card layout.
 */
export interface EmailShellSlots {
  /**
   * H2 heading shown at the top of the card. Keep it under ~50 characters
   * to ensure good readability on mobile clients.
   */
  title: string

  /**
   * Main body text. Rendered as a paragraph.
   * Safe inline HTML is allowed (e.g., `<strong>`, `<a href="...">`),
   * but avoid block elements (`<p>`, `<div>`) that could break
   * the layout structure in rigid email clients (Outlook, Gmail).
   */
  body: string

  /**
   * Optional call-to-action button, rendered as a dark link-button.
   * Omit for notification-only emails that do not require user action.
   */
  cta?: { label: string; href: string }

  /**
   * Optional warning paragraph. Rendered in red (#ef4444) to attract
   * attention. Use it for security alerts
   * ("if it wasn't you, act immediately").
   */
  warning?: string

  /**
   * Small gray text at the bottom of the card.
   * Used for notes like "automated notification, do not reply".
   */
  footer: string
}

/**
 * Builds the base HTML layout shared by all Beech CMS transactional emails.
 *
 * ─── SINGLE SOURCE OF TRUTH FOR BRANDING ─────────────────────────────────────
 * Modifying this function changes the visual appearance of ALL outgoing emails
 * simultaneously:
 *   - background and card color
 *   - border style and border-radius
 *   - typographic scale and spacing
 *   - CTA button style
 *
 * To change the text or structure of a specific email, instead modify
 * the corresponding template file (`templates/password-reset.ts`, etc.).
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * @param locale - Used for the `lang` attribute of the `<html>` tag.
 * @param slots  - Content blocks injected into the layout.
 * @returns A complete and self-contained HTML document ready to be sent.
 */
export function buildEmailShell(locale: EmailLocale, slots: EmailShellSlots): string {
  const ctaBlock = slots.cta
    ? `<a href="${slots.cta.href}"
          style="display:inline-block;background:#111;color:#fff;padding:12px 24px;
                 border-radius:6px;text-decoration:none;font-size:15px;font-weight:500;
                 margin-bottom:24px">
         ${slots.cta.label}
       </a>`
    : ''

  const warningBlock = slots.warning
    ? `<p style="margin:0 0 24px;color:#ef4444;font-size:15px;line-height:1.5;font-weight:500">
         ${slots.warning}
       </p>`
    : ''

  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="font-family:sans-serif;background:#f9f9f9;margin:0;padding:32px">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:8px;
              padding:32px;border:1px solid #e5e5e5">
    <h2 style="margin:0 0 16px;font-size:20px;color:#111">${slots.title}</h2>
    <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.5">${slots.body}</p>
    ${ctaBlock}${warningBlock}<p style="margin:0;color:#999;font-size:13px">${slots.footer}</p>
  </div>
</body>
</html>`
}
