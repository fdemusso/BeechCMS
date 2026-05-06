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
