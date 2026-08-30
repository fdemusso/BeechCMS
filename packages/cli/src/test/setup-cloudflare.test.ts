// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setupCloudflare } from '../commands/setup-cloudflare.js'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

describe('setupCloudflare command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('provisions D1 database and R2 bucket non-interactively with derived names', async () => {
    vi.mocked(spawnSync).mockImplementation((_cmd, args: any) => {
      if (args[1] === 'd1' && args[2] === 'create') {
        return {
          status: 0,
          stdout: '✅ Successfully created DB!\n database_id = "11111111-2222-3333-4444-555555555555"',
          stderr: '',
        } as any
      }
      if (args[1] === 'r2' && args[2] === 'bucket') {
        return {
          status: 0,
          stdout: 'Created bucket my-app-media',
          stderr: '',
        } as any
      }
      return { status: 0, stdout: '', stderr: '' } as any
    })

    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
      name: 'my-app',
      d1_databases: [{ binding: 'DB', database_name: 'old-db', database_id: 'old-id' }],
      r2_buckets: [{ binding: 'MEDIA_BUCKET', bucket_name: 'old-media' }],
    }))

    await setupCloudflare({ projectName: 'my-app', nonInteractive: true })

    expect(spawnSync).toHaveBeenCalledWith('npx', ['wrangler', 'd1', 'create', 'my-app-db'], expect.any(Object))
    expect(spawnSync).toHaveBeenCalledWith('npx', ['wrangler', 'r2', 'bucket', 'create', 'my-app-media'], expect.any(Object))
    expect(writeFileSync).toHaveBeenCalled()
  })
})
