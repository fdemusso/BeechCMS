// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import fs from 'node:fs'
import path from 'node:path'

export function getMailpitPort(): string {
  if (process.env.BEECH_MAILPIT_UI_PORT) return process.env.BEECH_MAILPIT_UI_PORT
  if (process.env.SMTP_PORT) return process.env.SMTP_PORT

  // Try loading from .dev.vars
  const candidates = [
    path.resolve('.dev.vars'),
    path.resolve('apps/api/.dev.vars'),
    path.resolve('../../.dev.vars'),
  ]
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf8')
        const match = content.match(/^SMTP_PORT=(.*)$/m)
        if (match) return match[1].trim()
      }
    } catch {
      // Ignore
    }
  }
  return '8025'
}

const BASE = `http://localhost:${getMailpitPort()}`

export interface MailpitMessage {
  ID: string
  From: { Address: string; Name: string }
  To: Array<{ Address: string; Name: string }>
  Subject: string
  Snippet: string
}

async function deleteAllMessages(): Promise<void> {
  await fetch(`${BASE}/api/v1/messages`, { method: 'DELETE' })
}

export async function listMessages(): Promise<MailpitMessage[]> {
  const res = await fetch(`${BASE}/api/v1/messages`)
  if (!res.ok) throw new Error(`Mailpit list failed: ${res.status}`)
  const json = await res.json() as { messages: MailpitMessage[] }
  return json.messages
}

export async function getMessageHtml(id: string): Promise<string> {
  const res = await fetch(`${BASE}/api/v1/message/${id}`)
  if (!res.ok) throw new Error(`Mailpit get failed: ${res.status}`)
  const json = await res.json() as { HTML: string }
  return json.HTML
}

export async function waitForMessage(predicate: (m: MailpitMessage) => boolean, timeoutMs = 3000): Promise<MailpitMessage> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const msgs = await listMessages()
    const match = msgs.find(predicate)
    if (match) return match
    await new Promise(r => setTimeout(r, 100))
  }
  throw new Error('Timed out waiting for Mailpit message')
}
