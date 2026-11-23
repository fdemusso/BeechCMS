// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * `beech run` — flow tier (real createBeechApp, D1TestDatabase, real OAuth token).
 * Runs real fixture scripts through the default dynamic import of `runScript` against the in-process API.
 */

import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeEach } from 'vitest'
import { FixedClock, UUID_V4_PATTERN } from '@beechcms/testing'
import { createBeechApp } from '../../src/factory'
import { runScript, type RunScriptInput } from '../../../../packages/cli/src/lib/script-runner'
import type { RunReport } from '../../../../packages/cli/src/sdk/run-report'
import type { SdkTransport } from '../../../../packages/cli/src/sdk/types'
import { D1TestDatabase } from '../helpers/d1-test-database'
import { seedTestUsers } from '../helpers/seed-fixtures'
import { CLI_SCOPES, createTargetSeed, issueToken } from '../helpers/oauth-flow'
import { TEST_USERS, TEST_ENV } from '../fixtures'

const FIXED_NOW_MS = 1_700_000_000_000
const API_URL = 'http://localhost:8789'
const MISSING_ENTRY_ID = '00000000-0000-4000-8000-000000000000'

describe('beech run — flow (real D1)', () => {
  let db: D1TestDatabase
  let app: ReturnType<typeof createBeechApp>
  let scriptToken: string

  const env = () => ({ ...TEST_ENV, DB: db })

  /** Transport over the in-process app, authenticated like `beech-mcp-cli`. */
  function transportFor(token: string): SdkTransport {
    return {
      async send({ method, path, body }) {
        return app.request(path, {
          method,
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        }, env())
      },
    }
  }

  /** Runs `fixtures/scripts/<name>.ts` through the default `importScript`. */
  function runFixture(name: string, overrides: Partial<Pick<RunScriptInput, 'args' | 'dryRun'>> = {}): Promise<RunReport> {
    const scriptPath = fileURLToPath(new URL(`../fixtures/scripts/${name}.ts`, import.meta.url))
    return runScript({
      scriptPath,
      displayPath: `fixtures/scripts/${name}.ts`,
      args: {},
      dryRun: false,
      transport: transportFor(scriptToken),
      apiUrl: API_URL,
      ...overrides,
    })
  }

  async function articleCount(): Promise<number> {
    const row = await db.prepare('SELECT COUNT(*) AS n FROM content_articles').first<{ n: number }>()
    return row?.n ?? 0
  }

  async function login(email: string): Promise<string> {
    const res = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'password123' }),
    }, env())
    expect(res.status).toBe(200)
    return (await res.json<{ token: string }>()).token
  }

  beforeEach(async () => {
    db = new D1TestDatabase()
    await seedTestUsers(db, TEST_USERS)
    app = createBeechApp({ seeds: [], authProviders: { clock: new FixedClock(FIXED_NOW_MS) } })
    const adminToken = await login(TEST_USERS[0].email)
    await createTargetSeed(app, db, adminToken)
    scriptToken = (await issueToken(app, db, adminToken, CLI_SCOPES, 'state-run')).access_token
  })

  it('a script that creates an entry reports ok with one executed call and the row exists in D1', async () => {
    const report = await runFixture('create-entry', { args: { title: 'From a script' } })

    expect(report.status).toBe('ok')
    const result = report.result as { kind: string; id: string }
    expect(result.kind).toBe('executed')
    expect(result.id).toMatch(UUID_V4_PATTERN)
    expect(report.calls.map(call => [call.operationId, call.outcome])).toEqual([['content.create', 'executed']])
    const row = await db.prepare('SELECT COUNT(*) AS n FROM content_articles WHERE id = ?').bind(result.id).first<{ n: number }>()
    expect(row?.n).toBe(1)
  })

  it('the same script under dryRun reports a dry-run call and the table stays empty', async () => {
    const report = await runFixture('create-entry', { args: { title: 'Never stored' }, dryRun: true })

    expect(report.status).toBe('ok')
    expect(report.dryRun).toBe(true)
    expect(report.result).toEqual({ kind: 'dry-run' })
    expect(report.calls.map(call => [call.operationId, call.outcome])).toEqual([['content.create', 'dry-run']])
    expect(await articleCount()).toBe(0)
  })

  it('a purge with the CLI token is reported as a pending intent and the entry still exists', async () => {
    const created = await runFixture('create-entry', { args: { title: 'Keep me' } })
    const id = (created.result as { id: string }).id

    const report = await runFixture('purge-entry', { args: { id } })

    expect(report.status).toBe('ok')
    expect(report.result).toBe('pending')
    expect(report.logs).toEqual(['purge outcome: pending'])
    expect(report.pendingIntents).toHaveLength(1)
    expect(report.pendingIntents[0]).toMatchObject({ operationId: 'content.delete', risk: 'destructive', status: 'pending' })
    const entry = await db.prepare('SELECT COUNT(*) AS n FROM content_articles WHERE id = ?').bind(id).first<{ n: number }>()
    expect(entry?.n).toBe(1)
    const intent = await db.prepare('SELECT status FROM agent_intents WHERE operation_id = ?').bind('content.delete').first<{ status: string }>()
    expect(intent?.status).toBe('pending')
  })

  it('an API 404 inside the script reports error with status 404 and operationId content.get', async () => {
    const report = await runFixture('read-missing', { args: { id: MISSING_ENTRY_ID } })

    expect(report.status).toBe('error')
    expect(report.result).toBeNull()
    expect(report.error).toMatchObject({ status: 404, operationId: 'content.get' })
    expect(report.calls.map(call => [call.operationId, call.outcome, call.status])).toEqual([['content.get', 'error', 404]])
    expect(await articleCount()).toBe(0)
  })

  it('a module whose default export is not a function reports invalid_script with no calls', async () => {
    const report = await runFixture('not-a-function')

    expect(report.status).toBe('error')
    expect(report.error?.code).toBe('invalid_script')
    expect(report.calls).toEqual([])
    expect(await articleCount()).toBe(0)
  })
})
