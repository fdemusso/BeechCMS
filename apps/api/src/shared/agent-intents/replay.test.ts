// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
import { intentPayloadHash, readIntentReplay, withIntentReplay, type IntentReplay } from './replay'
import { TEST_ENV as BASE_TEST_ENV } from '../../../test/fixtures'
import type { Env } from '../../types'

const TEST_ENV: Env = { ...BASE_TEST_ENV, DB: {} as D1Database }

const REPLAY: IntentReplay = {
  intentId: 'intent-1',
  userId: 'user-1',
  clientId: 'beech-mcp',
  scope: ['content:delete'],
  payloadHash: 'abc',
}

describe('intent replay marker', () => {
  it('reads back the replay it was given and leaves the original env untouched', () => {
    const carried = withIntentReplay(TEST_ENV, REPLAY)

    const replay = readIntentReplay(carried)

    expect(replay).toEqual(REPLAY)
    expect(readIntentReplay(TEST_ENV)).toBeNull()
  })

  it('returns null for an env that came from outside', () => {
    const forged = { ...TEST_ENV, 'beechcms.intentReplay': REPLAY, intentReplay: REPLAY }

    const replay = readIntentReplay(forged)

    expect(replay).toBeNull()
  })
})

describe('intentPayloadHash', () => {
  it('hashes method, path with query and body deterministically', async () => {
    const base = await intentPayloadHash('DELETE', '/api/content/posts/e1?purge=true', null)

    const again = await intentPayloadHash('DELETE', '/api/content/posts/e1?purge=true', null)
    const lowerCase = await intentPayloadHash('delete', '/api/content/posts/e1?purge=true', null)
    const otherMethod = await intentPayloadHash('PUT', '/api/content/posts/e1?purge=true', null)
    const otherQuery = await intentPayloadHash('DELETE', '/api/content/posts/e1', null)
    const otherBody = await intentPayloadHash('DELETE', '/api/content/posts/e1?purge=true', '{}')

    expect(again).toBe(base)
    expect(lowerCase).toBe(base)
    expect(new Set([base, otherMethod, otherQuery, otherBody]).size).toBe(4)
  })
})
