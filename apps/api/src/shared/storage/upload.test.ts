// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { deleteR2Objects } from './upload'

describe('deleteR2Objects', () => {
  it('successfully deletes, untracks, and decrements storage for a tracked key', async () => {
    const bucket = { delete: vi.fn().mockResolvedValue(undefined) }
    const mediaRepository = {
      getByKey: vi.fn().mockResolvedValue({ key: 'file1.png', size_bytes: 100 }),
      untrack: vi.fn().mockResolvedValue(undefined),
    }
    const systemStatsRepository = {
      decrementStorage: vi.fn().mockResolvedValue(undefined),
    }
    const c = { var: { bucket, mediaRepository, systemStatsRepository } } as any

    await deleteR2Objects(c, ['file1.png'])

    expect(mediaRepository.getByKey).toHaveBeenCalledWith('file1.png')
    expect(bucket.delete).toHaveBeenCalledWith('file1.png')
    expect(mediaRepository.untrack).toHaveBeenCalledWith('file1.png')
    expect(systemStatsRepository.decrementStorage).toHaveBeenCalledWith(100)
  })

  it('fails and throws error if key is not tracked in database', async () => {
    const bucket = { delete: vi.fn().mockResolvedValue(undefined) }
    const mediaRepository = {
      getByKey: vi.fn().mockResolvedValue(null),
      untrack: vi.fn().mockResolvedValue(undefined),
    }
    const systemStatsRepository = {
      decrementStorage: vi.fn().mockResolvedValue(undefined),
    }
    const c = { var: { bucket, mediaRepository, systemStatsRepository } } as any

    await expect(deleteR2Objects(c, ['untracked-file.png'])).rejects.toThrow('Media object not found: untracked-file.png')

    expect(mediaRepository.getByKey).toHaveBeenCalledWith('untracked-file.png')
    expect(bucket.delete).not.toHaveBeenCalled()
    expect(mediaRepository.untrack).not.toHaveBeenCalled()
    expect(systemStatsRepository.decrementStorage).not.toHaveBeenCalled()
  })

  it('does not treat a getByKey rejection as "not tracked" (avoids leaking the R2 object)', async () => {
    const bucket = { delete: vi.fn().mockResolvedValue(undefined) }
    const mediaRepository = {
      getByKey: vi.fn().mockRejectedValue(new Error('D1_ERROR: database is locked')),
      untrack: vi.fn().mockResolvedValue(undefined),
    }
    const systemStatsRepository = {
      decrementStorage: vi.fn().mockResolvedValue(undefined),
    }
    const c = { var: { bucket, mediaRepository, systemStatsRepository } } as any

    await expect(deleteR2Objects(c, ['flaky-lookup.png'])).rejects.not.toThrow('Media object not found')
    await expect(deleteR2Objects(c, ['flaky-lookup.png'])).rejects.toThrow('flaky-lookup.png')

    expect(mediaRepository.getByKey).toHaveBeenCalledWith('flaky-lookup.png')
    expect(bucket.delete).not.toHaveBeenCalled()
    expect(mediaRepository.untrack).not.toHaveBeenCalled()
    expect(systemStatsRepository.decrementStorage).not.toHaveBeenCalled()
  })

  it('does not untrack or decrement stats if R2 deletion fails', async () => {
    const bucket = { delete: vi.fn().mockRejectedValue(new Error('S3 Connection Failed')) }
    const mediaRepository = {
      getByKey: vi.fn().mockResolvedValue({ key: 'file1.png', size_bytes: 100 }),
      untrack: vi.fn().mockResolvedValue(undefined),
    }
    const systemStatsRepository = {
      decrementStorage: vi.fn().mockResolvedValue(undefined),
    }
    const c = { var: { bucket, mediaRepository, systemStatsRepository } } as any

    await expect(deleteR2Objects(c, ['file1.png'])).rejects.toThrow('S3 Connection Failed')

    expect(bucket.delete).toHaveBeenCalledWith('file1.png')
    expect(mediaRepository.untrack).not.toHaveBeenCalled()
    expect(systemStatsRepository.decrementStorage).not.toHaveBeenCalled()
  })

  it('surfaces an error when untrack fails after a successful R2 delete, instead of silently swallowing it', async () => {
    const bucket = { delete: vi.fn().mockResolvedValue(undefined) }
    const mediaRepository = {
      getByKey: vi.fn().mockResolvedValue({ key: 'file1.png', size_bytes: 100 }),
      untrack: vi.fn().mockRejectedValue(new Error('D1_ERROR: database is locked')),
    }
    const systemStatsRepository = {
      decrementStorage: vi.fn().mockResolvedValue(undefined),
    }
    const c = { var: { bucket, mediaRepository, systemStatsRepository } } as any

    await expect(deleteR2Objects(c, ['file1.png'])).rejects.toThrow('file1.png')

    // R2 object is already gone even though the DB row is now out of sync.
    expect(bucket.delete).toHaveBeenCalledWith('file1.png')
    expect(mediaRepository.untrack).toHaveBeenCalledWith('file1.png')
    expect(systemStatsRepository.decrementStorage).not.toHaveBeenCalled()
  })

  it('surfaces an error when decrementStorage fails after a successful untrack', async () => {
    const bucket = { delete: vi.fn().mockResolvedValue(undefined) }
    const mediaRepository = {
      getByKey: vi.fn().mockResolvedValue({ key: 'file1.png', size_bytes: 100 }),
      untrack: vi.fn().mockResolvedValue(undefined),
    }
    const systemStatsRepository = {
      decrementStorage: vi.fn().mockRejectedValue(new Error('D1_ERROR: database is locked')),
    }
    const c = { var: { bucket, mediaRepository, systemStatsRepository } } as any

    await expect(deleteR2Objects(c, ['file1.png'])).rejects.toThrow('file1.png')

    expect(mediaRepository.untrack).toHaveBeenCalledWith('file1.png')
    expect(systemStatsRepository.decrementStorage).toHaveBeenCalledWith(100)
  })

  it('still untracks/decrements the other keys when one key fails, and reports only the failed one', async () => {
    const bucket = { delete: vi.fn().mockResolvedValue(undefined) }
    const mediaRepository = {
      getByKey: vi.fn().mockImplementation((key: string) =>
        Promise.resolve({ key, size_bytes: 100 })
      ),
      untrack: vi.fn().mockImplementation((key: string) =>
        key === 'bad.png' ? Promise.reject(new Error('D1_ERROR: database is locked')) : Promise.resolve(undefined)
      ),
    }
    const systemStatsRepository = {
      decrementStorage: vi.fn().mockResolvedValue(undefined),
    }
    const c = { var: { bucket, mediaRepository, systemStatsRepository } } as any

    await expect(deleteR2Objects(c, ['good.png', 'bad.png'])).rejects.toThrow('bad.png')

    expect(mediaRepository.untrack).toHaveBeenCalledWith('good.png')
    expect(systemStatsRepository.decrementStorage).toHaveBeenCalledWith(100)
  })

  it('Issue #347: deduplicates duplicate keys and decrements storage only once', async () => {
    const bucket = { delete: vi.fn().mockResolvedValue(undefined) }
    const mediaRepository = {
      getByKey: vi.fn().mockResolvedValue({ key: 'duplicate.png', size_bytes: 500 }),
      untrack: vi.fn().mockResolvedValue(undefined),
    }
    const systemStatsRepository = {
      decrementStorage: vi.fn().mockResolvedValue(undefined),
    }
    const c = { var: { bucket, mediaRepository, systemStatsRepository } } as any

    await deleteR2Objects(c, ['duplicate.png', 'duplicate.png', 'duplicate.png'])

    expect(mediaRepository.getByKey).toHaveBeenCalledTimes(1)
    expect(bucket.delete).toHaveBeenCalledTimes(1)
    expect(mediaRepository.untrack).toHaveBeenCalledTimes(1)
    expect(systemStatsRepository.decrementStorage).toHaveBeenCalledTimes(1)
    expect(systemStatsRepository.decrementStorage).toHaveBeenCalledWith(500)
  })

  it('Issue #349: waits for all operations to settle and aggregates both bucket and untrack failures', async () => {
    const bucket = {
      delete: vi.fn().mockImplementation((key: string) =>
        key === 'keyA.png' ? Promise.reject(new Error('S3 network timeout')) : Promise.resolve(undefined)
      ),
    }
    const mediaRepository = {
      getByKey: vi.fn().mockImplementation((key: string) =>
        Promise.resolve({ key, size_bytes: 300 })
      ),
      untrack: vi.fn().mockImplementation((key: string) =>
        key === 'keyB.png' ? Promise.reject(new Error('D1 database busy')) : Promise.resolve(undefined)
      ),
    }
    const systemStatsRepository = {
      decrementStorage: vi.fn().mockResolvedValue(undefined),
    }
    const c = { var: { bucket, mediaRepository, systemStatsRepository } } as any

    let thrownError: Error | null = null
    try {
      await deleteR2Objects(c, ['keyA.png', 'keyB.png'])
    } catch (err: any) {
      thrownError = err
    }

    expect(thrownError).not.toBeNull()
    expect(thrownError?.message).toContain('S3 network timeout')
    expect(thrownError?.message).toContain('1 media row(s) now out of sync (R2 object deleted but DB untrack/decrement failed): keyB.png')

    // keyA failed at bucket delete, so mediaRepository.untrack should NOT be called for keyA
    expect(mediaRepository.untrack).not.toHaveBeenCalledWith('keyA.png')
    // keyB succeeded at bucket delete, so untrack was called and failed
    expect(bucket.delete).toHaveBeenCalledWith('keyB.png')
    expect(mediaRepository.untrack).toHaveBeenCalledWith('keyB.png')
  })

  it('Security: safely handles prototype pollution keys without throwing unexpected prototype errors', async () => {
    const bucket = { delete: vi.fn().mockResolvedValue(undefined) }
    const mediaRepository = {
      getByKey: vi.fn().mockResolvedValue(null),
      untrack: vi.fn().mockResolvedValue(undefined),
    }
    const systemStatsRepository = {
      decrementStorage: vi.fn().mockResolvedValue(undefined),
    }
    const c = { var: { bucket, mediaRepository, systemStatsRepository } } as any

    const reservedKeys = ['constructor', 'toString', '__proto__', 'valueOf', 'hasOwnProperty']
    for (const key of reservedKeys) {
      await expect(deleteR2Objects(c, [key])).rejects.toThrow(`Media object not found: ${key}`)
    }
  })
})
