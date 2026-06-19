// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
import { SmtpEmailProvider } from '../src/features/email/providers/smtp'
import { waitForMessage, getMessageHtml, getMailpitPort } from './helpers/mailpit-client'

describe('SmtpEmailProvider (integration with Mailpit)', () => {
  it('delivers an HTML email to Mailpit', async () => {
    const provider = new SmtpEmailProvider({ baseUrl: `http://localhost:${getMailpitPort()}` })
    await provider.send({
      from: 'Test <noreply@beech.local>',
      to: ['alice@example.com'],
      subject: 'Hello from Beech',
      html: '<p>This is a <strong>test</strong></p>',
    })
    const msg = await waitForMessage(m => m.Subject === 'Hello from Beech', 10000)
    expect(msg.To[0].Address).toBe('alice@example.com')
    const html = await getMessageHtml(msg.ID)
    expect(html).toContain('<strong>test</strong>')
  }, 15000)

  it('throws on Mailpit error', async () => {
    const provider = new SmtpEmailProvider({ baseUrl: `http://localhost:${getMailpitPort()}` })
    await expect(provider.send({
      from: '', to: [], subject: '', html: '',
    })).rejects.toThrow(/SmtpEmailProvider/)
  })
})
