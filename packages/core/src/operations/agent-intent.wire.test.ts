// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { isAgentIntentPendingResponse } from './agent-intent.wire.js'

const gateBody = {
  intent: {
    id: 'a3f1c2d4-0b5e-4c1a-9e1f-2b7d6a8c9e10',
    operationId: 'content.delete',
    risk: 'destructive',
    summary: 'Permanently delete posts entry e1',
    status: 'pending',
    expiresAt: 1_900_000_600,
  },
}

describe('isAgentIntentPendingResponse', () => {
  it('recognises the gate 202 body as a pending intent', () => {
    const result = isAgentIntentPendingResponse(gateBody)

    expect(result).toBe(true)
  })

  it('rejects the import-job and seed-purge 202 bodies', () => {
    const bodies: unknown[] = [{ jobId: 'j1' }, { jobId: 'j2', status: 'queued' }]

    const results = bodies.map(isAgentIntentPendingResponse)

    expect(results).toEqual([false, false])
  })

  it('rejects an intent whose status is not pending', () => {
    const executed = { intent: { ...gateBody.intent, status: 'executed' } }

    const result = isAgentIntentPendingResponse(executed)

    expect(result).toBe(false)
  })

  it('rejects non-object bodies without throwing', () => {
    const bodies: unknown[] = [null, 'x', [], { intent: null }]

    const results = bodies.map(isAgentIntentPendingResponse)

    expect(results).toEqual([false, false, false, false])
  })
})
