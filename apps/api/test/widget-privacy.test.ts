// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import { widgetApp } from '../src/features/widget/widget'
import { PrivacyService, type Seed } from '@beechcms/core'

const PRIVACY_SEED: Seed = {
  slug: 'clienti',
  displayNameAlias: 'name',
  label: 'Cliente',
  labelPlural: 'Clienti',
  allowDrafts: false,
  branches: [
    { id: 'br_c1', alias: 'name', label: 'Nome', type: 'text' },
    { id: 'br_c2', alias: 'email', label: 'Email', type: 'text', policies: { classification: 'confidential' } },
  ],
}

describe('widgetApp — Privacy & ALE Decryption', () => {
  const masterKey = 'super-secret-master-key-32-chars-long'
  const privacyService = new PrivacyService(masterKey)

  it('decrypts confidential encrypted fields in /list/:seed endpoint', async () => {
    const encryptedEmail = await privacyService.encrypt('elisa.colombo@vertexdigital.com')

    const mockWidgetRepo = {
      list: vi.fn().mockResolvedValue({
        entries: [
          {
            id: 'c_01',
            slug: 'elisa-colombo',
            status: 'published',
            created_at: 1700000000,
            updated_at: 1700000000,
            name: 'Elisa Colombo',
            email: encryptedEmail,
          },
        ],
        totalCount: 1,
      }),
    }

    const app = new Hono<any>()
    app.use('*', async (c, next) => {
      c.set('getSeed', (slug: string) => (slug === 'clienti' ? PRIVACY_SEED : null))
      c.set('widgetRepository', mockWidgetRepo)
      c.set('privacyService', privacyService)
      await next()
    })
    app.route('/widget', widgetApp)

    const response = await app.request('/widget/list/clienti')

    expect(response.status).toBe(200)
    const json = (await response.json()) as any
    expect(json.entries).toHaveLength(1)
    expect(json.entries[0].name).toBe('Elisa Colombo')
    // Crucial check: email should be decrypted plaintext, not raw 'v1:...' ciphertext
    expect(json.entries[0].email).toBe('elisa.colombo@vertexdigital.com')
  })
})
