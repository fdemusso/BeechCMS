// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { CANONICAL_USERS, createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

// `users` is read by exactly one query: the content scan, which scans it on every run (avatars).
const CONTENT_SCAN_SQL = 'SELECT avatar_url FROM users'
const REFERENCED_KEY = 'avatar-reviewed.png'

describe('settings slice — storage content scan cache (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient
  let contentScans: number

  /** Real D1, with every content scan counted. */
  function countingDatabase(database: D1Database): D1Database {
    return new Proxy(database, {
      get(target, property) {
        const member = Reflect.get(target, property, target)
        if (property !== 'prepare') return typeof member === 'function' ? member.bind(target) : member
        return (sql: string) => {
          if (sql === CONTENT_SCAN_SQL) contentScans++
          return target.prepare(sql)
        }
      },
    })
  }

  beforeEach(async () => {
    __resetSeedRegistryCache()
    contentScans = 0
    harness = await createTestHarness({
      db: countingDatabase(env.DB),
      env: { MEDIA_BUCKET: env.MEDIA_BUCKET },
      createApp: authProviders => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    await env.DB.prepare('DELETE FROM media_objects').run()
    await env.DB.prepare('UPDATE users SET avatar_url = NULL').run()
    await env.MEDIA_BUCKET.delete(REFERENCED_KEY)
    contentScans = 0
  })

  it('repeated storage reports run one content scan', async () => {
    const pages = ['?offset=0', '?offset=12', '?offset=24', '?offset=0']

    for (const page of pages) {
      const response = await admin.get(`/api/settings/storage${page}`)
      expect(response.status).toBe(200)
    }

    expect(contentScans).toBe(1)
  })

  it('refuses to delete a file referenced after the report was cached', async () => {
    await env.MEDIA_BUCKET.put(REFERENCED_KEY, 'x')
    await env.DB.prepare(
      'INSERT INTO media_objects (key, filename, mime_type, size_bytes, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(REFERENCED_KEY, REFERENCED_KEY, 'image/png', 1, CANONICAL_USERS.admin.id, 100).run()
    const cachedReport = await admin.get('/api/settings/storage')
    const cachedBody = await cachedReport.json<{ orphans: Array<{ key: string }> }>()
    expect(cachedBody.orphans.map(file => file.key)).toEqual([REFERENCED_KEY])
    await env.DB.prepare('UPDATE users SET avatar_url = ? WHERE id = ?')
      .bind(`http://localhost/api/media/${REFERENCED_KEY}`, CANONICAL_USERS.admin.id).run()

    const response = await admin.post('/api/settings/storage/orphans/delete', { keys: [REFERENCED_KEY] })

    expect(response.status).toBe(409)
    const tracked = await env.DB.prepare('SELECT COUNT(*) AS total FROM media_objects WHERE key = ?').bind(REFERENCED_KEY).first<{ total: number }>()
    expect(tracked?.total).toBe(1)
    expect(await env.MEDIA_BUCKET.head(REFERENCED_KEY)).not.toBeNull()
  })
})
