// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export interface IdempotencyRecord {
  key: string
  fingerprint: string
  responseStatus: number
  responseBody: string
  expiresAt: number
}

export interface IdempotencyRepository {
  lookup(key: string): Promise<IdempotencyRecord | null>
  store(record: IdempotencyRecord): Promise<void>
  cleanup(now: number): Promise<void>
}
