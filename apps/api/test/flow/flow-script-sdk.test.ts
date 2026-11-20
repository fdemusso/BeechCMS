// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Script SDK — flow tier (real createBeechApp, D1TestDatabase, real OAuth token, MinIO).
 * Covers the SDK helpers and the intent outcome against the real API. Method ↔ catalog parity
 * is unit-tested in packages/cli/src/test/sdk-parity.test.ts.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3'
import { FixedClock, UUID_V4_PATTERN } from '@beechcms/testing'
import { createBeechApp } from '../../src/factory'
import { contentImportJobs } from '../../src/features/content/jobs/import-chunk.worker'
import { createBeechSdk } from '../../../../packages/cli/src/sdk/create-sdk'
import type { SdkTransport } from '../../../../packages/cli/src/sdk/types'
import { D1TestDatabase } from '../helpers/d1-test-database'
import { seedTestUsers } from '../helpers/seed-fixtures'
import { CLI_SCOPES, SEED_SLUG, createTargetSeed, issueToken } from '../helpers/oauth-flow'
import { TEST_USERS, TEST_ENV } from '../fixtures'

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT ?? 'http://localhost:9000',
  credentials: { accessKeyId: 'beechdev', secretAccessKey: 'beechdevsecret' },
  forcePathStyle: true,
})

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const FIXED_NOW_MS = 1_700_000_000_000
const LIST_PAGE_SIZE = 100
const READ_ONLY_SCOPES = 'schema:read content:read'

describe('script SDK — flow (real D1, MinIO)', () => {
  let db: D1TestDatabase
  let app: ReturnType<typeof createBeechApp>
  let adminToken: string
  let scriptToken: string
  let presignedKeys: string[]

  const env = () => ({ ...TEST_ENV, DB: db })

  /** Transport over the in-process app; records every presigned key so tests can inspect storage. */
  function transportFor(token: string): SdkTransport {
    return {
      async send({ method, path, body }) {
        const response = await app.request(path, {
          method,
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        }, env())
        if (path.endsWith('/api/upload/presign')) {
          presignedKeys.push((await response.clone().json<{ key: string }>()).key)
        }
        return response
      },
    }
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

  async function articleCount(): Promise<number> {
    const row = await db.prepare('SELECT COUNT(*) AS n FROM content_articles').first<{ n: number }>()
    return row?.n ?? 0
  }

  async function createArticle(title: string): Promise<string> {
    const { sdk } = createBeechSdk({ transport: transportFor(scriptToken) })
    const outcome = await sdk.content.create(SEED_SLUG, { title })
    if (outcome.kind !== 'executed') throw new Error(`Arrange failed: create answered ${outcome.kind}`)
    return outcome.data.id
  }

  beforeEach(async () => {
    db = new D1TestDatabase()
    await seedTestUsers(db, TEST_USERS)
    const clock = new FixedClock(FIXED_NOW_MS)
    app = createBeechApp({ seeds: [], authProviders: { clock }, jobs: contentImportJobs })
    presignedKeys = []
    adminToken = await login(TEST_USERS[0].email)
    await createTargetSeed(app, db, adminToken)
    scriptToken = (await issueToken(app, db, adminToken, CLI_SCOPES, 'state-sdk')).access_token
  })

  it('listAll returns every entry of a seed across two pages', async () => {
    for (let index = 0; index <= LIST_PAGE_SIZE; index++) await createArticle(`Entry ${index}`)
    const { sdk } = createBeechSdk({ transport: transportFor(scriptToken) })

    const entries = await sdk.content.listAll(SEED_SLUG)

    expect(entries).toHaveLength(LIST_PAGE_SIZE + 1)
    expect(new Set(entries.map(entry => entry.id)).size).toBe(LIST_PAGE_SIZE + 1)
    expect(entries.every(entry => UUID_V4_PATTERN.test(entry.id))).toBe(true)
  })

  it('uploadFile stores the object in MinIO and registers it in media_objects', async () => {
    const { sdk } = createBeechSdk({ transport: transportFor(scriptToken) })

    const outcome = await sdk.media.uploadFile({ filename: 'sdk-upload.png', mimeType: 'image/png', data: PNG_SIGNATURE })

    expect(outcome.kind).toBe('executed')
    const key = presignedKeys[0]
    await expect(s3.send(new HeadObjectCommand({ Bucket: TEST_ENV.R2_BUCKET_NAME, Key: key }))).resolves.toBeTruthy()
    const row = await db.prepare('SELECT COUNT(*) AS n FROM media_objects WHERE key = ?').bind(key).first<{ n: number }>()
    expect(row?.n).toBe(1)
  })

  it('importFile imports NDJSON rows and removes the transport object', async () => {
    const titles = ['First', 'Second', 'Third']
    const data = new TextEncoder().encode(titles.map(title => JSON.stringify({ title })).join('\n') + '\n')
    const { sdk } = createBeechSdk({ transport: transportFor(scriptToken) })

    const outcome = await sdk.content.importFile(SEED_SLUG, { filename: 'rows.ndjson', format: 'ndjson', data })

    expect(outcome).toMatchObject({ kind: 'executed', data: { state: 'completed', insertedRows: 3 } })
    const entries = await sdk.content.listAll(SEED_SLUG)
    expect(entries.map(entry => entry.data.title).sort()).toEqual([...titles].sort())
    const head = s3.send(new HeadObjectCommand({ Bucket: TEST_ENV.R2_BUCKET_NAME, Key: presignedKeys[0] }))
    await expect(head).rejects.toMatchObject({ name: 'NotFound' })
  })

  it('a purge with the script token returns a pending intent and leaves the entry in place', async () => {
    const id = await createArticle('Keep me')
    const { sdk } = createBeechSdk({ transport: transportFor(scriptToken) })

    const outcome = await sdk.content.delete(SEED_SLUG, id, { purge: 'true' })

    expect(outcome).toMatchObject({ kind: 'pending', intent: { operationId: 'content.delete', risk: 'destructive' } })
    const intent = await db.prepare('SELECT status FROM agent_intents WHERE operation_id = ?').bind('content.delete').first<{ status: string }>()
    expect(intent?.status).toBe('pending')
    const entry = await sdk.content.get(SEED_SLUG, id)
    expect(entry.id).toBe(id)
  })

  it('dry-run writes nothing and still reads', async () => {
    const id = await createArticle('Live entry')
    const { sdk, journal } = createBeechSdk({ transport: transportFor(scriptToken), dryRun: true })

    async function dryRunScript() {
      const created = await sdk.content.create(SEED_SLUG, { title: 'Never stored' })
      const deleted = await sdk.content.delete(SEED_SLUG, id)
      const listing = await sdk.content.list(SEED_SLUG)
      return { created, deleted, listing }
    }
    const result = await dryRunScript()

    expect(result.created.kind).toBe('dry-run')
    expect(result.deleted.kind).toBe('dry-run')
    expect(result.listing.total).toBe(1)
    expect(journal.calls.filter(call => call.outcome === 'dry-run')).toHaveLength(2)
    expect(await articleCount()).toBe(1)
  })

  it('a token without content:write gets BeechSdkError insufficient_scope and writes nothing', async () => {
    const readOnlyToken = (await issueToken(app, db, adminToken, READ_ONLY_SCOPES, 'state-read-only')).access_token
    const { sdk } = createBeechSdk({ transport: transportFor(readOnlyToken) })

    const failure = sdk.content.create(SEED_SLUG, { title: 'Rejected' })

    await expect(failure).rejects.toMatchObject({ name: 'BeechSdkError', status: 403, code: 'insufficient_scope' })
    expect(await articleCount()).toBe(0)
  })
})
