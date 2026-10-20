// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
import { normaliseEmbeddingResponse } from './embedding-response'

function vec(n = 384): number[] {
  return new Array(n).fill(0.01)
}

describe('normaliseEmbeddingResponse', () => {
  it('accepts a raw Float32Array', () => {
    const result = normaliseEmbeddingResponse(new Float32Array(vec()))
    expect(result).toBeInstanceOf(Float32Array)
    expect(result.length).toBe(384)
  })

  it('accepts { data: number[][] } (nested shape)', () => {
    const result = normaliseEmbeddingResponse({ data: [vec()] })
    expect(result.length).toBe(384)
  })

  it('accepts { data: number[] } (flat shape)', () => {
    const result = normaliseEmbeddingResponse({ data: vec() })
    expect(result.length).toBe(384)
  })

  it('accepts a plain number[]', () => {
    const result = normaliseEmbeddingResponse(vec())
    expect(result.length).toBe(384)
  })

  it('accepts { data: Float32Array }', () => {
    const result = normaliseEmbeddingResponse({ data: new Float32Array(vec()) })
    expect(result.length).toBe(384)
  })

  it('throws on an unrecognised response shape', () => {
    expect(() => normaliseEmbeddingResponse({ unexpected: true })).toThrow(
      '[search/embedding-response] Unexpected AI response shape from embedding model',
    )
  })

  it('throws when the vector length does not match EMBEDDING_DIMENSIONS (#610)', () => {
    expect(() => normaliseEmbeddingResponse(new Float32Array(vec(3)))).toThrow(
      '[search/embedding-response] Embedding has 3 dimensions, expected 384',
    )
  })
})
