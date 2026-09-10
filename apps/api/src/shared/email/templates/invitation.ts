// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { EmailLocale } from '../email.types'
import { buildEmailShell } from './shell'

const COPY: Record<EmailLocale, {
  subject: string
  title: string
  body: (roleName: string, scopeLabel: string) => string
  ctaLabel: string
  footer: string
}> = {
  en: {
    subject: 'You have been invited to Beech CMS',
    title: 'Activate your account',
    body: (roleName, scopeLabel) =>
      `You have been invited to Beech CMS as <strong>${roleName}</strong> on <strong>${scopeLabel}</strong>. Click the button below to set your password and activate your account. This link expires in 72 hours and can be used once.`,
    ctaLabel: 'Activate account',
    footer: "If you weren't expecting this invitation, you can safely ignore this email.",
  },
  it: {
    subject: 'Sei stato invitato su Beech CMS',
    title: 'Attiva il tuo account',
    body: (roleName, scopeLabel) =>
      `Sei stato invitato su Beech CMS come <strong>${roleName}</strong> su <strong>${scopeLabel}</strong>. Clicca il pulsante qui sotto per impostare la password e attivare il tuo account. Questo link scade tra 72 ore e può essere usato una sola volta.`,
    ctaLabel: 'Attiva account',
    footer: 'Se non ti aspettavi questo invito, puoi ignorare questa email in tutta sicurezza.',
  },
}

/**
 * @param inviteUrl  `${APP_URL}/admin/accept-invite?token=<opaque hex>` — built by the
 *                   caller and embedded verbatim in the CTA; the token is generated
 *                   internally by `generateOpaqueToken()` (hex only).
 * @param roleName   `roles.name` of the pre-assigned role.
 * @param scopeLabel The seed slug, or a localized label for `'*'`.
 */
export function buildInvitationEmail(
  inviteUrl: string,
  roleName: string,
  scopeLabel: string,
  locale: EmailLocale,
): { subject: string; html: string } {
  const c = COPY[locale]
  return {
    subject: c.subject,
    html: buildEmailShell(locale, {
      title: c.title,
      body: c.body(roleName, scopeLabel),
      cta: { label: c.ctaLabel, href: inviteUrl },
      footer: c.footer,
    }),
  }
}
