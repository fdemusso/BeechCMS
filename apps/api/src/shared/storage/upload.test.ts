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
})
