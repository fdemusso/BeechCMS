// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { resolveEdgeCache, withCachedResponse } from '../src/public/cache-utils'
import type { Context } from 'hono'

describe('cache-utils', () => {
  const originalCaches = (globalThis as any).caches

  afterEach(() => {
    if (originalCaches === undefined) {
      delete (globalThis as any).caches
    } else {
      (globalThis as any).caches = originalCaches
    }
  })

  describe('resolveEdgeCache', () => {
    it('returns null if caches is not defined', () => {
      delete (globalThis as any).caches
      const mockCtx = {
        executionCtx: {
          waitUntil: () => {}
        }
      } as unknown as Context

      const result = resolveEdgeCache(mockCtx)
      expect(result).toBeNull()
    })

    it('returns null if executionCtx throws or is missing', () => {
      (globalThis as any).caches = {
        default: {}
      } as any

      // Context with getter that throws
      const mockCtx1 = {} as unknown as Context
      Object.defineProperty(mockCtx1, 'executionCtx', {
        get() {
          throw new Error('No ctx')
        }
      })

      expect(resolveEdgeCache(mockCtx1)).toBeNull()

      const mockCtx2 = {
        executionCtx: null
      } as unknown as Context
      expect(resolveEdgeCache(mockCtx2)).toBeNull()
    })

    it('returns null if executionCtx.waitUntil is missing', () => {
      (globalThis as any).caches = {
        default: {}
      } as any

      const mockCtx = {
        executionCtx: {}
      } as unknown as Context

      expect(resolveEdgeCache(mockCtx)).toBeNull()
    })

    it('returns cache and executionCtx if all conditions are met', () => {
      const mockCache = { put: vi.fn() };
      (globalThis as any).caches = {
        default: mockCache
      } as any

      const mockCtx = {
        executionCtx: {
          waitUntil: vi.fn()
        }
      } as unknown as Context

      const result = resolveEdgeCache(mockCtx)
      expect(result).not.toBeNull()
      expect(result?.cache).toBe(mockCache)
      expect(result?.executionCtx).toBe(mockCtx.executionCtx)
    })
  })

  describe('withCachedResponse', () => {
    it('returns response immediately if edgeCache is null', () => {
      const response = new Response('ok')
      const result = withCachedResponse(null, new Request('http://localhost'), response)
      expect(result).toBe(response)
    })

    it('clones response, sets Cache-Control, and puts in cache via waitUntil', async () => {
      const mockCache = {
        put: vi.fn().mockResolvedValue(undefined)
      }
      const mockExecutionCtx = {
        waitUntil: vi.fn()
      }
      const edgeCache = {
        cache: mockCache as any,
        executionCtx: mockExecutionCtx
      }

      const request = new Request('http://localhost')
      const response = new Response('body text', {
        status: 200,
        headers: { 'X-Test': 'true' }
      })

      const result = withCachedResponse(edgeCache, request, response)
      expect(result).toBe(response)
      expect(mockExecutionCtx.waitUntil).toHaveBeenCalled()

      // Extract the promise passed to waitUntil and wait for it
      const cachedResponsePromise = mockExecutionCtx.waitUntil.mock.calls[0][0]
      await cachedResponsePromise

      expect(mockCache.put).toHaveBeenCalled()
      const putArgs = mockCache.put.mock.calls[0]
      expect(putArgs[0]).toBe(request)
      
      const cachedResponse = putArgs[1] as Response
      expect(await cachedResponse.text()).toBe('body text')
      expect(cachedResponse.status).toBe(200)
      expect(cachedResponse.headers.get('Cache-Control')).toBe('public, max-age=60')
      expect(cachedResponse.headers.get('X-Test')).toBe('true')
    })
  })
})
