import { describe, it, expect, beforeEach } from 'vitest'
import { SmtpEmailProvider } from '../src/features/email/providers/smtp'
import { deleteAllMessages, waitForMessage, getMessageHtml } from './helpers/mailpit-client'

describe('SmtpEmailProvider (integration with Mailpit)', () => {
  beforeEach(() => deleteAllMessages())

  it('delivers an HTML email to Mailpit', async () => {
    const provider = new SmtpEmailProvider({ baseUrl: 'http://localhost:8025' })
    await provider.send({
      from: 'Test <noreply@beech.local>',
      to: ['alice@example.com'],
      subject: 'Hello from Beech',
      html: '<p>This is a <strong>test</strong></p>',
    })
    const msg = await waitForMessage(m => m.Subject === 'Hello from Beech')
    expect(msg.To[0].Address).toBe('alice@example.com')
    const html = await getMessageHtml(msg.ID)
    expect(html).toContain('<strong>test</strong>')
  })

  it('throws on Mailpit error', async () => {
    const provider = new SmtpEmailProvider({ baseUrl: 'http://localhost:8025' })
    await expect(provider.send({
      from: '', to: [], subject: '', html: '',
    })).rejects.toThrow(/SmtpEmailProvider/)
  })
})
