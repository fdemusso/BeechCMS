// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * @module search/utils/embedding-response
 * Single source of truth for turning a Workers AI embedding response into a
 * validated `Float32Array`. Shared by {@link ../handlers/embed.embedHandler}
 * and {@link ../jobs/semantic-search.worker.computeVectorJob} so the two
 * callers cannot drift into different failure modes for the same bad input.
 */

import { EMBEDDING_DIMENSIONS } from '../constants'

/**
 * Normalises the heterogeneous response shapes returned by the Workers AI
 * embedding model into a single `Float32Array`, and validates its length
 * against {@link EMBEDDING_DIMENSIONS}.
 *
 * The model may return any of:
 * - A raw `Float32Array`
 * - An object `{ data: number[] | number[][] | Float32Array }`
 * - A plain `number[]`
 *
 * @param aiResponse - Raw value returned by `ai.run(EMBEDDING_MODEL, ...)`.
 * @returns A `Float32Array` of exactly {@link EMBEDDING_DIMENSIONS} floats.
 * @throws `Error` when the response shape is unrecognised, or when the
 *   resulting vector's length does not equal {@link EMBEDDING_DIMENSIONS}
 *   (a wrong-sized vector would misalign the concatenated `vectors.bin`
 *   for every record that follows it).
 */
export function normaliseEmbeddingResponse(aiResponse: unknown): Float32Array {
  const vector = extractVector(aiResponse)

  if (vector.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `[search/embedding-response] Embedding has ${vector.length} dimensions, expected ${EMBEDDING_DIMENSIONS}`,
    )
  }

  return vector
}

function extractVector(aiResponse: unknown): Float32Array {
  if (aiResponse instanceof Float32Array) {
    return aiResponse
  }

  if (Array.isArray((aiResponse as any)?.data)) {
    const dataField = (aiResponse as any).data as unknown[]
    const vectorData = Array.isArray(dataField[0])
      ? (dataField[0] as number[])
      : (dataField as number[])
    return new Float32Array(vectorData)
  }

  if (Array.isArray(aiResponse)) {
    return new Float32Array(aiResponse as number[])
  }

  if ((aiResponse as any)?.data instanceof Float32Array) {
    return (aiResponse as any).data as Float32Array
  }

  throw new Error('[search/embedding-response] Unexpected AI response shape from embedding model')
}
