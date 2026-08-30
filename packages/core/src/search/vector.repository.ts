// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { Seed } from '../engine/types.js'

export interface IVectorRepository {
  /** Saves or updates the embedding vector for an entry */
  saveVector(seed: Seed, entryId: string, vector: Float32Array): Promise<void>

  /** Removes the embedding vector (used when unpublished/deleted) */
  deleteVector(seed: Seed, entryId: string): Promise<void>

  /** Retrieves all vectors for a given seed to compile to R2 */
  getAllVectors(seed: Seed): Promise<{ entryId: string; vector: Float32Array }[]>
}
