import { IdempotencyRepository, IdempotencyRecord } from '@beechcms/core'

export class StaticIdempotencyRepository implements IdempotencyRepository {
  private records = new Map<string, IdempotencyRecord>()

  async lookup(key: string): Promise<IdempotencyRecord | null> {
    const record = this.records.get(key)
    if (!record) return null
    if (record.expiresAt < Math.floor(Date.now() / 1000)) {
      this.records.delete(key)
      return null
    }
    return record
  }

  async store(record: IdempotencyRecord): Promise<void> {
    this.records.set(record.key, record)
  }

  async cleanup(now: number): Promise<void> {
    for (const [key, record] of this.records) {
      if (record.expiresAt < now) this.records.delete(key)
    }
  }
}
