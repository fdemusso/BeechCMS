// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from 'vitest'
import { internalErrorDetail } from './problem-details'

const GENERIC = 'An unexpected error occurred.'
const INTERNAL = new Error('D1_ERROR: SELECT private_column FROM content_private: no such column')

describe('internalErrorDetail', () => {
  it.each([
    ['ENV omitted', {}],
    ['ENV undefined', { ENV: undefined }],
    ['ENV empty', { ENV: '' }],
    ['ENV unknown name', { ENV: 'staging' }],
    ['ENV production', { ENV: 'production' }],
  ])('returns the generic detail when %s', (_label, env) => {
    expect(internalErrorDetail(env, INTERNAL)).toBe(GENERIC)
  })

  it.each(['development', 'test'])('exposes the message when ENV is %s', (name) => {
    expect(internalErrorDetail({ ENV: name }, INTERNAL)).toBe(INTERNAL.message)
  })

  it('returns the generic detail for a non-Error throwable even in development', () => {
    expect(internalErrorDetail({ ENV: 'development' }, 'boom')).toBe(GENERIC)
  })
})
