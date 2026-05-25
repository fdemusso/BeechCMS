const BASE = process.env.WEBHOOK_TESTER_URL ?? 'http://localhost:8084'

export interface WebhookTesterRequest {
  uuid: string
  method: string
  headers: Record<string, string>
  body: string
}

interface RawRequest {
  uuid: string
  method: string
  headers: Array<{ name: string; value: string }>
  request_payload_base64: string
}

/** Creates a session via the webhook-tester API and returns the bucket URL + UUID. */
export async function newBucket(): Promise<{ url: string; uuid: string }> {
  const res = await fetch(`${BASE}/api/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status_code: 200 }),
  })
  if (!res.ok) throw new Error(`webhook-tester session creation failed: ${res.status}`)
  const { uuid } = await res.json() as { uuid: string }
  return { url: `${BASE}/${uuid}`, uuid }
}

export async function getRequests(uuid: string): Promise<WebhookTesterRequest[]> {
  const res = await fetch(`${BASE}/api/session/${uuid}/requests`)
  if (!res.ok) return []
  const raw = await res.json() as RawRequest[]
  return raw.map(r => ({
    uuid: r.uuid,
    method: r.method,
    headers: Object.fromEntries(r.headers.map(h => [h.name.toLowerCase(), h.value])),
    body: r.request_payload_base64 ? Buffer.from(r.request_payload_base64, 'base64').toString('utf8') : '',
  }))
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
