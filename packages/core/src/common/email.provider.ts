// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * The resolved email message that the provider receives and sends.
 * Constructed by the service by combining call parameters with template builder output.
 */
export interface OutboundEmail {
  /** Sender address in RFC 5321 format (e.g., "Beech CMS <noreply@beechcms.dev>"). */
  from: string
  /** List of recipient addresses. Must contain at least one element. */
  to: string[]
  subject: string
  /** Complete HTML body. Must be a valid HTML document (see templates/shell.ts). */
  html: string
}

/**
 * Formal contract for email sending providers.
 *
 * Every implementation (Resend, SMTP, …) must comply with this interface.
 * It is the only point of coupling between the email module and any external service.
 *
 * To add a new provider: create a class in apps/api/src/shared/email/providers/
 * that implements this interface, then wire it in email.service.ts.
 */
export interface EmailProvider {
  /**
   * Sends a single transactional email.
   *
   * @throws {Error} If the provider rejects the request. The caller is responsible
   *                 for catching and handling this error appropriately.
   */
  send(email: OutboundEmail): Promise<void>
}
