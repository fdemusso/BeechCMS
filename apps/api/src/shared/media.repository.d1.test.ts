import { describe, it, expect, vi } from 'vitest'
import { D1MediaRepository } from './media.repository.d1'

function makeMockDb(opts: { firstResult?: unknown; allResults?: unknown[] } = {}) {
  const { firstResult = null, allResults = [] } = opts
  const runMock = vi.fn().mockResolvedValue({ success: true })
  const firstMock = vi.fn().mockResolvedValue(firstResult)
  const allMock = vi.fn().mockResolvedValue({ results: allResults })
  // bind() returns the same interface so chains like prepare().bind().all() work.
  // The statement also exposes first/all/run directly for queries that skip bind().
  const bindMock = vi.fn(() => ({ run: runMock, first: firstMock, all: allMock }))
  const stmt = { bind: bindMock, run: runMock, first: firstMock, all: allMock }
  const prepareMock = vi.fn(() => stmt)
  return { db: { prepare: prepareMock } as any, prepareMock, bindMock, runMock, firstMock, allMock }
}

describe('D1MediaRepository', () => {
  describe('trackUpload', () => {
    it('calls INSERT INTO media_objects with correct bound values', async () => {
      const { db, prepareMock, bindMock } = makeMockDb()
      const obj = { key: 'k1', filename: 'img.png', mime_type: 'image/png', size_bytes: 1024, uploaded_by: 'user-1' }
      await new D1MediaRepository(db).trackUpload(obj)
      expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO media_objects'))
      expect(bindMock).toHaveBeenCalledWith('k1', 'img.png', 'image/png', 1024, 'user-1')
    })
  })

  describe('getByKey', () => {
    it('returns the media object when found', async () => {
      const row = { key: 'k1', filename: 'img.png', mime_type: 'image/png', size_bytes: 512, uploaded_by: 'u1', created_at: 1000 }
      const { db } = makeMockDb({ firstResult: row })
      const result = await new D1MediaRepository(db).getByKey('k1')
      expect(result).toEqual(row)
    })

    it('returns null when the key is not found', async () => {
      const { db } = makeMockDb({ firstResult: null })
      expect(await new D1MediaRepository(db).getByKey('ghost')).toBeNull()
    })

    it('passes the key as bound value', async () => {
      const { db, bindMock } = makeMockDb()
      await new D1MediaRepository(db).getByKey('my-key')
      expect(bindMock).toHaveBeenCalledWith('my-key')
    })
  })

  describe('untrack', () => {
    it('calls DELETE FROM media_objects with the key', async () => {
      const { db, prepareMock, bindMock } = makeMockDb()
      await new D1MediaRepository(db).untrack('k1')
      expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM media_objects'))
      expect(bindMock).toHaveBeenCalledWith('k1')
    })
  })

  describe('list', () => {
    it('returns items and total from D1', async () => {
      const rows = [
        { key: 'k1', filename: 'a.png', mime_type: 'image/png', size_bytes: 100, uploaded_by: 'u1', created_at: 1000 },
      ]
      const { db, allMock, firstMock } = makeMockDb()
      // list() calls all() for items then first() for count (without bind)
      allMock.mockResolvedValueOnce({ results: rows })
      firstMock.mockResolvedValueOnce({ total: 1 })

      const result = await new D1MediaRepository(db).list({ limit: 10, offset: 0 })
      expect(result.items).toHaveLength(1)
      expect(result.total).toBe(1)
    })

    it('returns empty items and 0 total when D1 returns nothing', async () => {
      const { db, allMock, firstMock } = makeMockDb()
      allMock.mockResolvedValueOnce({ results: [] })
      firstMock.mockResolvedValueOnce(null) // count row is null → 0

      const result = await new D1MediaRepository(db).list({ limit: 10, offset: 0 })
      expect(result.items).toEqual([])
      expect(result.total).toBe(0)
    })

    it('passes limit and offset as bound values for the list query', async () => {
      const { db, bindMock, allMock, firstMock } = makeMockDb()
      allMock.mockResolvedValueOnce({ results: [] })
      firstMock.mockResolvedValueOnce({ total: 0 })

      await new D1MediaRepository(db).list({ limit: 5, offset: 10 })
      expect(bindMock).toHaveBeenCalledWith(5, 10)
    })
  })

  describe('count', () => {
    it('returns the count from D1', async () => {
      const { db } = makeMockDb({ firstResult: { total: 42 } })
      expect(await new D1MediaRepository(db).count()).toBe(42)
    })

    it('returns 0 when D1 returns null', async () => {
      const { db } = makeMockDb({ firstResult: null })
      expect(await new D1MediaRepository(db).count()).toBe(0)
    })
  })
})
