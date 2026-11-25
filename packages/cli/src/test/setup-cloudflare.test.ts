// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as p from '@clack/prompts'
import { setupCloudflare } from '../commands/setup-cloudflare.js'
import { parseDevVars } from '../lib/dev-vars.js'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, type PathOrFileDescriptor } from 'node:fs'

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  note: vi.fn(),
  cancel: vi.fn(),
  isCancel: vi.fn(() => false),
  confirm: vi.fn(),
  text: vi.fn(),
  password: vi.fn(),
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
  log: { success: vi.fn(), warn: vi.fn() },
}))

describe('setupCloudflare command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('interactive R2 setup merges the credentials into an existing .dev.vars and keeps every other line', async () => {
    const existingDevVars = 'JWT_SECRET=keep-me\nBEECH_SECRET_KEY=beech_sk_dev\nPRIVACY_MASTER_KEY=never-rotated\n'
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: '', stderr: '' } as unknown as ReturnType<typeof spawnSync>)
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockImplementation((path: PathOrFileDescriptor) =>
      String(path).endsWith('.dev.vars') ? existingDevVars : JSON.stringify({ name: 'my-app' }),
    )
    vi.mocked(p.confirm).mockResolvedValue(true)
    vi.mocked(p.text).mockResolvedValueOnce('acc123').mockResolvedValueOnce('access-id')
    vi.mocked(p.password).mockResolvedValue('access-secret')

    await setupCloudflare({ projectName: 'my-app' })

    const devVarsWrite = vi.mocked(writeFileSync).mock.calls.find(([path]) => String(path).endsWith('.dev.vars'))
    expect(devVarsWrite).toBeDefined()
    expect(parseDevVars(String(devVarsWrite![1]))).toEqual({
      JWT_SECRET: 'keep-me',
      BEECH_SECRET_KEY: 'beech_sk_dev',
      PRIVACY_MASTER_KEY: 'never-rotated',
      R2_ACCESS_KEY_ID: 'access-id',
      R2_SECRET_ACCESS_KEY: 'access-secret',
      R2_ENDPOINT: 'https://acc123.r2.cloudflarestorage.com',
      R2_BUCKET_NAME: 'my-app-media',
    })
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
