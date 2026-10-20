// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { BeechBucket, DeletionLedgerEvent, IDeletionLedger } from '@beechcms/core'

/** Reserved key space. Leading underscore keeps it out of any media listing. */
const LEDGER_PREFIX = '_deletion-ledger'

function eventKey(event: DeletionLedgerEvent): string {
  return `${LEDGER_PREFIX}/${event.seedSlug}/${event.entryId}.json`
}

/**
 * R2-backed erasure log. One object per erasure, written with `put` and never mutated.
 * Survives a D1 Time Travel restore, which is the entire point of the design
 * (feature brief §2: the ledger must not live in D1).
 */
export class R2DeletionLedger implements IDeletionLedger {
  constructor(private readonly bucket: BeechBucket) {}

  async append(event: DeletionLedgerEvent): Promise<void> {
    const body = new TextEncoder().encode(JSON.stringify(event))
    // No catch: a purge that reports success without a durable ledger entry is precisely the
    // failure this feature exists to prevent. The caller surfaces the error to the operator.
    await this.bucket.put(eventKey(event), body, { contentType: 'application/json' })
  }

  async list(
    seedSlug: string,
    options?: { limit?: number; cursor?: string },
  ): Promise<{ events: DeletionLedgerEvent[]; nextCursor?: string }> {
    const listing = await this.bucket.list({
      prefix: `${LEDGER_PREFIX}/${seedSlug}/`,
      limit: options?.limit ?? 100,
      cursor: options?.cursor,
    })

    const events: DeletionLedgerEvent[] = []
    for (const object of listing.objects) {
      const stored = await this.bucket.get(object.key)
      if (!stored) continue
      const text = stored.body instanceof ArrayBuffer
        ? new TextDecoder().decode(stored.body)
        : await new Response(stored.body).text()
      events.push(JSON.parse(text) as DeletionLedgerEvent)
    }

    return { events, ...(listing.cursor ? { nextCursor: listing.cursor } : {}) }
  }
}
