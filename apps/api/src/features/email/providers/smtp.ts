/// <reference types="@cloudflare/workers-types" />
import type { EmailProvider } from '../email.provider'
import type { OutboundEmail } from '../email.types'

export interface SmtpProviderConfig {
  /** Base URL of the Mailpit HTTP API, e.g. http://localhost:8025 */
  baseUrl: string
}

interface MailpitAddress { Name?: string; Email: string }
interface MailpitSendPayload {
  From: MailpitAddress
  To: MailpitAddress[]
  Subject: string
  HTML?: string
  Text?: string
}

function parseAddress(raw: string): MailpitAddress {
  const match = raw.match(/^\s*(.+?)\s*<([^>]+)>\s*$/)
  if (match) return { Name: match[1], Email: match[2] }
  return { Email: raw.trim() }
}

export class SmtpEmailProvider implements EmailProvider {
  private readonly endpoint: string

  constructor(config: SmtpProviderConfig) {
    this.endpoint = `${config.baseUrl.replace(/\/$/, '')}/api/v1/send`
  }

  async send(email: OutboundEmail): Promise<void> {
    const payload: MailpitSendPayload = {
      From: parseAddress(email.from),
      To: email.to.map(parseAddress),
      Subject: email.subject,
      HTML: email.html,
    }

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => `HTTP ${response.status}`)
      throw new Error(`[SmtpEmailProvider] send failed — ${body}`)
    }
  }
}
