// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Context } from 'hono'
import { resolveEdgeCache } from './edge-cache'

function contextWithoutExecutionCtx(): Context {
  return {
    get executionCtx(): never {
      throw new Error('This context has no ExecutionContext')
    },
  } as unknown as Context
}

function contextWithExecutionCtx(executionCtx: unknown): Context {
  return { executionCtx } as unknown as Context
}

describe('resolveEdgeCache', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns null when the caches global is unavailable', () => {
    // No `caches` stub: this is the runtime every other test in this suite already runs in.
    const result = resolveEdgeCache(contextWithExecutionCtx({ waitUntil: vi.fn() }))

    expect(result).toBeNull()
  })

  it('returns null when the execution context is unavailable', () => {
    vi.stubGlobal('caches', { default: {} as Cache })

    const result = resolveEdgeCache(contextWithoutExecutionCtx())

    expect(result).toBeNull()
  })

  it('returns null when the execution context has no waitUntil', () => {
    vi.stubGlobal('caches', { default: {} as Cache })

    const result = resolveEdgeCache(contextWithExecutionCtx({}))

    expect(result).toBeNull()
  })

  it('returns the default cache and execution context when both are available', () => {
    const cache = {} as Cache
    vi.stubGlobal('caches', { default: cache })
    const waitUntil = vi.fn()

    const result = resolveEdgeCache(contextWithExecutionCtx({ waitUntil }))

    expect(result).toEqual({ cache, executionCtx: { waitUntil } })
  })
})
