const BASE = process.env.WEBHOOK_TESTER_URL ?? 'http://localhost:8084'

export interface WebhookTesterRequest {
  uuid: string
  method: string
  headers: Record<string, string>
  body: string
  created_at_unix: number
}

export function newBucket(): { url: string; uuid: string } {
  const uuid = crypto.randomUUID()
  return { url: `${BASE}/${uuid}`, uuid }
}

export async function getRequests(uuid: string): Promise<WebhookTesterRequest[]> {
  const res = await fetch(`${BASE}/api/session/${uuid}/requests`)
  if (!res.ok) return []
  return await res.json() as WebhookTesterRequest[]
}

export async function waitForRequest(uuid: string, timeoutMs = 3000): Promise<WebhookTesterRequest> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const reqs = await getRequests(uuid)
    if (reqs.length > 0) return reqs[0]
    await new Promise(r => setTimeout(r, 100))
  }
  throw new Error('Timed out waiting for webhook delivery')
}
