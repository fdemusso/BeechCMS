// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
// Source imports: the @beechcms/testing dist has extensionless re-exports that Node ESM cannot load.
import { CANONICAL_SEEDS } from '../../packages/testing/src/seeds/canonical.seeds.ts'
import { CANONICAL_USERS } from '../../packages/testing/src/seeds/canonical.data.ts'
import { createAdminApi, EvalSetupError, type AdminApi } from './admin-api.ts'

const EVAL_API_PORT = 8798          // 8789 dev, 8799 e2e: an eval never adopts or is adopted by either
export const EVAL_API_URL = `http://127.0.0.1:${EVAL_API_PORT}`
const EVAL_PERSIST_DIR = 'evals/.wrangler-evals'   // relative to the repo root; resolved absolute at runtime
const EVAL_JWT_SECRET = 'agent-evals-secret-at-least-32-bytes-long'
const STACK_READY_TIMEOUT_MS = 180_000

export interface EvalStack { readonly apiUrl: string; stop(): Promise<void> }
export interface EvalWorld { api: AdminApi; adminToken: string }

const REQUIRED_BUILD_OUTPUTS = [
  'packages/cli/dist/index.js',
  'packages/cli/dist/sdk/index.js',
  'packages/mcp/dist/index.js',
  'packages/mcp/resources/manifest.json',
  'packages/api-client/dist/index.js',
  'packages/testing/dist/index.js',
  'apps/dashboard/dist/admin/index.html',
]
const V1_PACKAGE = '@beechcms/mcp@1.2.0'
const STOP_GRACE_MS = 10_000

async function isStackAnswering(): Promise<boolean> {
  try {
    await fetch(`${EVAL_API_URL}/auth/setup`, { signal: AbortSignal.timeout(2_000) })
    return true
  } catch {
    return false
  }
}

/** Fails fast, before anything boots, when a prerequisite of the run is missing. */
export async function preflight(repoRoot: string): Promise<void> {
  const missing = REQUIRED_BUILD_OUTPUTS.filter(file => !existsSync(join(repoRoot, file)))
  if (missing.length > 0) throw new Error(`run pnpm build first (missing ${missing.join(', ')})`)
  try {
    execFileSync('claude', ['--version'], { stdio: 'pipe' })
  } catch {
    throw new Error('claude CLI not found')
  }
  if (await isStackAnswering()) throw new Error(`port ${EVAL_API_PORT} busy`)
  // Warms the npx cache so the first v1 MCP start does not spend Claude Code's startup timeout downloading.
  execFileSync('npm', ['cache', 'add', V1_PACKAGE], { stdio: 'pipe' })
}

let liveStackProcess: ChildProcess | null = null

/** Synchronously kills the live wrangler process group. For exit handlers. */
export function killLiveStack(): void {
  const pid = liveStackProcess?.pid
  if (pid === undefined) return
  try {
    process.kill(-pid, 'SIGKILL')
  } catch {
    // Already gone.
  }
  liveStackProcess = null
}

/** Recreates the D1 database, boots `wrangler dev` on the eval port and waits until it answers. */
export async function startFreshStack(repoRoot: string): Promise<EvalStack> {
  const persistDir = resolve(repoRoot, EVAL_PERSIST_DIR)
  rmSync(persistDir, { recursive: true, force: true })
  execFileSync('node', [join(repoRoot, 'apps/api/scripts/bootstrap-d1.mjs')], {
    cwd: join(repoRoot, 'apps/api'),
    stdio: 'pipe',
    env: { ...process.env, BEECH_D1_PERSIST_DIR: persistDir },
  })

  const runDir = process.env.BEECH_EVAL_RUN_DIR ?? join(repoRoot, 'evals/.runs')
  mkdirSync(runDir, { recursive: true })
  const logFd = openSync(join(runDir, 'wrangler.log'), 'a')
  const child = spawn('pnpm', [
    '--filter', '@beechcms/api', 'exec', 'wrangler', 'dev',
    '--port', String(EVAL_API_PORT),
    '--persist-to', persistDir,
    '--var', 'ENV:development',
    '--var', `JWT_SECRET:${EVAL_JWT_SECRET}`,
    '--var', `APP_URL:${EVAL_API_URL}`,
    '--var', `CORS_ORIGINS:${EVAL_API_URL}`,
  ], { cwd: repoRoot, detached: true, stdio: ['ignore', logFd, logFd] })
  closeSync(logFd)
  liveStackProcess = child
  const exited = new Promise<void>(resolveExit => child.once('exit', () => resolveExit()))

  let stopped = false
  const stop = async (): Promise<void> => {
    if (stopped) return
    stopped = true
    const pid = child.pid
    if (pid === undefined) return
    try {
      process.kill(-pid, 'SIGTERM')
    } catch {
      return
    }
    const graceful = await Promise.race([exited.then(() => true), new Promise<boolean>(resolveTimer => setTimeout(() => resolveTimer(false), STOP_GRACE_MS))])
    if (!graceful) {
      try {
        process.kill(-pid, 'SIGKILL')
      } catch {
        // Already gone.
      }
    }
    if (liveStackProcess === child) liveStackProcess = null
  }

  const deadline = Date.now() + STACK_READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${EVAL_API_URL}/auth/setup`, { signal: AbortSignal.timeout(2_000) })
      if (response.status === 200) return { apiUrl: EVAL_API_URL, stop }
    } catch {
      // Not listening yet.
    }
    await new Promise(resolveTimer => setTimeout(resolveTimer, 500))
  }
  await stop()
  throw new Error(`wrangler dev did not answer ${EVAL_API_URL}/auth/setup within ${STACK_READY_TIMEOUT_MS} ms`)
}

async function postPublic<T>(apiUrl: string, path: string, expected: number, body: unknown): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const parsed = await response.json().catch(() => null) as T
  if (response.status !== expected) throw new EvalSetupError(`POST ${path}: expected ${expected}, got ${response.status} ${JSON.stringify(parsed)}`)
  return parsed
}

/** Creates the first admin and the canonical seeds through the HTTP surface, exactly as e2e does. */
export async function provisionWorld(apiUrl: string): Promise<EvalWorld> {
  const admin = CANONICAL_USERS.admin
  await postPublic(apiUrl, '/auth/setup', 201, {
    email: admin.email,
    password: admin.password,
    name: admin.name,
    surname: 'Evals',
    track: 'developer',
    loadDemoData: false,
    settings: { language: 'en', timezone: 'UTC', currency: 'EUR' },
  })
  const { token } = await postPublic<{ token: string }>(apiUrl, '/auth/login', 200, { email: admin.email, password: admin.password })
  const api = createAdminApi(apiUrl, token)
  // Declaration order: posts has a relation to authors.
  for (const seed of CANONICAL_SEEDS) await api.expect('POST', '/api/seeds', 201, seed)
  return { api, adminToken: token }
}
