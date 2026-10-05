// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from 'vitest'
import { NoOpQueueService } from './queue.stub.js'

describe('NoOpQueueService', () => {
  it('reports a dropped message as unaccepted', async () => {
    const queue = new NoOpQueueService()

    // Dropped continuations must report failure.
    const accepted = await queue.enqueue('content.import.chunk', { jobId: 'job-1' })

    expect(accepted).toBe(false)
  })
})
