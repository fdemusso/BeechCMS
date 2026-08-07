// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi } from 'vitest'
import { PrivacyService } from './privacy.service.js'
import type { Seed, Branch } from './types.js'

const PRIVACY_SEED: Seed = {
  slug: 'users',
  displayNameAlias: 'name',
  label: 'User',
  branches: [
    { id: 'br_01', alias: 'name', type: 'text', policies: { privacy: 'plain' } },
    { id: 'br_02', alias: 'ssn', type: 'text', policies: { privacy: 'encrypt' } },
    { id: 'br_03', alias: 'email_hash', type: 'text', policies: { privacy: 'hash' } },
  ],
}

describe('PrivacyService & Field Protection contract', () => {
  const masterKey = 'super-secret-master-key-32-chars-long'
  const service = new PrivacyService(masterKey)

  it('encrypts sensitive plaintext using v1 prefix and AES-256-GCM', async () => {
    const ssn = '123-45-6789'
    const encrypted = await service.encrypt(ssn)

    expect(encrypted).toMatch(/^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/)
    expect(await service.decrypt(encrypted)).toBe(ssn)
  })

  it('hashes plain text deterministically for exact-match blind index using HMAC SHA-256', async () => {
    const email = 'john@example.com'
    const hash = await service.hash(email)

    expect(hash).toHaveLength(64)
    expect(await service.hash(email)).toBe(hash)
  })
})
