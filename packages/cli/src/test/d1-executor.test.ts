// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/wrangler.js', () => ({ queryD1: vi.fn() }))

import { queryD1 } from '../lib/wrangler.js'
import { createWranglerExecutor } from '../lib/d1-executor.js'
import type { WranglerOptions } from '../lib/wrangler.js'

const OPTIONS: WranglerOptions = { db: 'my-db', local: true, configPath: null }

describe('createWranglerExecutor', () => {
  beforeEach(() => vi.clearAllMocks())

  it('forwards the statement and options to queryD1 and resolves with its rows', async () => {
    vi.mocked(queryD1).mockReturnValueOnce([{ name: 'posts' }])

    const rows = await createWranglerExecutor(OPTIONS).all('SELECT name FROM sqlite_master')

    expect(queryD1).toHaveBeenCalledWith('SELECT name FROM sqlite_master', OPTIONS)
    expect(rows).toEqual([{ name: 'posts' }])
  })
})
