// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Content slice — integration tier. Covers `onDelete: 'RESTRICT'` on the soft-delete path of
 * `DELETE /api/content/:slug/:id`, against real D1 through the full middleware chain.
 * The purge path is guarded by the SQLite foreign key itself and is not repeated here.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { defineSeed } from '@beechcms/core'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

const ownerSeed = defineSeed({
  slug: 'rs_owners',
  label: 'Owner',
  labelPlural: 'Owners',
  displayNameAlias: 'name',
  branches: [
    { id: 'br_01', alias: 'name', label: 'Name', type: 'text', requiredOnCreate: true },
  ],
})

const vehicleSeed = defineSeed({
  slug: 'rs_vehicles',
  label: 'Vehicle',
  labelPlural: 'Vehicles',
  displayNameAlias: 'plate',
  branches: [
    { id: 'br_01', alias: 'plate', label: 'Plate', type: 'text', requiredOnCreate: true },
    { id: 'br_02', alias: 'owner', label: 'Owner', type: 'relation', targetSeed: 'rs_owners', onDelete: 'RESTRICT', requiredOnCreate: true },
  ],
})

const noteSeed = defineSeed({
  slug: 'rs_notes',
  label: 'Note',
  labelPlural: 'Notes',
  displayNameAlias: 'title',
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
    { id: 'br_02', alias: 'owner', label: 'Owner', type: 'relation', targetSeed: 'rs_owners', onDelete: 'SET NULL' },
  ],
})

describe('content slice — RESTRICT on soft delete (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      seeds: [ownerSeed, vehicleSeed, noteSeed],
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
  })

  async function createEntry(slug: string, body: Record<string, unknown>): Promise<string> {
    const created = await admin.post(`/api/content/${slug}`, body)
    expect(created.status).toBe(201)
    return (await created.json<{ id: string }>()).id
  }

  async function deletedAt(table: string, id: string): Promise<number | null> {
    const row = await harness.db
      .prepare(`SELECT deleted_at FROM ${table} WHERE id = ?`)
      .bind(id)
      .first<{ deleted_at: number | null }>()
    return row?.deleted_at ?? null
  }

  it('refuses to trash a parent that an active child references through RESTRICT with 409 relation-in-use', async () => {
    const ownerId = await createEntry('rs_owners', { name: 'Alice' })
    await createEntry('rs_vehicles', { plate: 'AB123CD', owner: ownerId })

    const response = await admin.delete(`/api/content/rs_owners/${ownerId}`)

    expect(response.status).toBe(409)
    const body = await response.json<{ type: string }>()
    expect(body.type).toMatch(/relation-in-use$/)
    expect(await deletedAt('content_rs_owners', ownerId)).toBeNull()
  })

  it('trashes a parent that is only referenced through a non-RESTRICT relation', async () => {
    const ownerId = await createEntry('rs_owners', { name: 'Bob' })
    await createEntry('rs_notes', { title: 'Note', owner: ownerId })

    const response = await admin.delete(`/api/content/rs_owners/${ownerId}`)

    expect(response.status).toBe(200)
    expect(await deletedAt('content_rs_owners', ownerId)).not.toBeNull()
  })

  it('trashes a RESTRICT parent once its only child is itself in the Trash', async () => {
    const ownerId = await createEntry('rs_owners', { name: 'Carol' })
    const vehicleId = await createEntry('rs_vehicles', { plate: 'ZZ999ZZ', owner: ownerId })
    expect((await admin.delete(`/api/content/rs_vehicles/${vehicleId}`)).status).toBe(200)

    const response = await admin.delete(`/api/content/rs_owners/${ownerId}`)

    expect(response.status).toBe(200)
    expect(await deletedAt('content_rs_owners', ownerId)).not.toBeNull()
  })
})
