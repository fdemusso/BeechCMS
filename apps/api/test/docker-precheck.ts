export interface RequiredService {
  name: string
  url: string
  containerName: string
}

export const REQUIRED_SERVICES: RequiredService[] = [
  { name: 'MinIO',          url: 'http://localhost:9000/minio/health/live', containerName: 'beech-minio' },
  { name: 'Mailpit',        url: 'http://localhost:8025/livez',             containerName: 'beech-mailpit' },
  { name: 'webhook-tester', url: 'http://localhost:8084/api/version',       containerName: 'beech-webhook-tester' },
]

interface CheckResult { service: RequiredService; ok: boolean; reason?: string }

async function checkOne(svc: RequiredService, timeoutMs = 2000): Promise<CheckResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(svc.url, { signal: controller.signal })
    return res.ok ? { service: svc, ok: true } : { service: svc, ok: false, reason: `HTTP ${res.status}` }
  } catch (err) {
    return { service: svc, ok: false, reason: err instanceof Error ? err.message : String(err) }
  } finally {
    clearTimeout(timer)
  }
}

export async function assertDockerStackReady(): Promise<void> {
  const results = await Promise.all(REQUIRED_SERVICES.map(s => checkOne(s)))
  const failed = results.filter(r => !r.ok)
  if (failed.length === 0) return

  const lines: string[] = [
    '',
    '═══════════════════════════════════════════════════════════════════════',
    '  ❌  Beech test suite cannot start — Docker stack is not ready.',
    '═══════════════════════════════════════════════════════════════════════',
    '',
    `  Services unreachable (${failed.length}/${REQUIRED_SERVICES.length}):`,
    ...failed.map(f => `    • ${f.service.name.padEnd(16)} ${f.service.url}   → ${f.reason}`),
    '',
    '  Beech requires the full Docker stack for integration tests.',
    '  No mocks, no fallbacks: the same containers used in `npm run dev:full`.',
    '',
    '  Fix:',
    '    1) npm run dev:full           # from repo root — starts the whole stack',
    '       (or, if the stack is already up, check `docker ps` for the container names',
    `        ${REQUIRED_SERVICES.map(s => s.containerName).join(', ')})`,
    '    2) Re-run the tests.',
    '',
    '═══════════════════════════════════════════════════════════════════════',
    '',
  ]
  throw new Error(lines.join('\n'))
}
