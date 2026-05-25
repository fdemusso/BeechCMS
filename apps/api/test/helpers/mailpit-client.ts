const BASE = 'http://localhost:8025'

export interface MailpitMessage {
  ID: string
  From: { Address: string; Name: string }
  To: Array<{ Address: string; Name: string }>
  Subject: string
  Snippet: string
}

export async function deleteAllMessages(): Promise<void> {
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
