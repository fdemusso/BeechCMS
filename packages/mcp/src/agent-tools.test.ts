// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AgentToolError,
  beechConfirm,
  beechIntents,
  beechWhoami,
  mapElicitResult,
  type AgentToolDeps,
  type ElicitOutcome,
} from './agent-tools.js'
import { CONFIRM_BODY_PREVIEW_CHARS, CONFIRM_RESULT_PREVIEW_CHARS } from './constants.js'

const NOW_SECONDS = 1_800_000_000
const FIRST_ID = '3f2b8c1e-5a47-4d0e-9b6a-1c2d3e4f5a6b'
const SECOND_ID = '7a9d4e2f-1b38-4c5d-8e7f-0a1b2c3d4e5f'

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** Hand-rolled: the MCP package has no canonical intent builders. */
const intentBody = (id: string, overrides: Record<string, unknown> = {}) => ({
  intent: {
    id,
    operationId: 'seeds.delete',
    risk: 'destructive',
    summary: `Delete a seed: DELETE /api/seeds/${id}`,
    status: 'pending',
    expiresAt: NOW_SECONDS + 600,
    body: null,
    ...overrides,
  },
})

describe('agent tools', () => {
  const send = vi.fn<AgentToolDeps['send']>()
  const elicit = vi.fn<AgentToolDeps['elicit']>()
  let deps: AgentToolDeps

  /** Answers GET intent detail for known ids, and POST decisions with `decisionAnswer`. */
  const routeIntents = (details: Record<string, unknown>, decisionAnswer: (id: string) => Response) => {
    send.mockImplementation(async (method, path) => {
      const id = path.split('/')[4]
      if (method === 'GET') return json(details[id])
      return decisionAnswer(id)
    })
  }
  const approved = (): Response => json({ intent: {}, result: { status: 200, body: { success: true } } })

  beforeEach(() => {
    vi.clearAllMocks()
    deps = {
      send,
      elicit,
      nowSeconds: () => NOW_SECONDS,
      apiUrl: 'http://localhost:8789',
      pendingActionsUrl: 'http://localhost:8789/admin/?settings=connected-apps&section=agent-actions',
      scriptScopes: () => null,
    }
    elicit.mockResolvedValue({ action: 'accept', decision: 'approve' })
  })

  describe('beechConfirm', () => {
    it('invalid intentIds are refused before any request', async () => {
      const invalidInputs: unknown[] = [[], Array.from({ length: 21 }, (_, index) => `id-${index}`), [''], 'x']

      const attempts = invalidInputs.map(intentIds => beechConfirm({ intentIds }, deps))

      for (const attempt of attempts) await expect(attempt).rejects.toBeInstanceOf(AgentToolError)
      expect(send).not.toHaveBeenCalled()
    })

    it('duplicate ids are collapsed and reported once in request order', async () => {
      routeIntents({ [FIRST_ID]: intentBody(FIRST_ID), [SECOND_ID]: intentBody(SECOND_ID) }, approved)

      const result = await beechConfirm({ intentIds: [SECOND_ID, FIRST_ID, SECOND_ID] }, deps)

      expect(result.results.map(item => item.id)).toEqual([SECOND_ID, FIRST_ID])
      expect(result.results.map(item => item.outcome)).toEqual(['executed', 'executed'])
    })

    it('the dialog body preview is cut to 300 characters with an ellipsis', async () => {
      const longBody = { text: 'x'.repeat(1_000) }
      routeIntents({ [FIRST_ID]: intentBody(FIRST_ID, { body: longBody }) }, approved)

      await beechConfirm({ intentIds: [FIRST_ID] }, deps)

      const message = elicit.mock.calls[0][0]
      const bodyLine = message.split('\n').find(line => line.startsWith('   body: ')) ?? ''
      expect(bodyLine).toBe(`   body: ${JSON.stringify(longBody).slice(0, CONFIRM_BODY_PREVIEW_CHARS)}…`)
    })

    it('the dialog tells the human to set Decision before accepting, without preselecting a decision', async () => {
      routeIntents({ [FIRST_ID]: intentBody(FIRST_ID) }, approved)

      await beechConfirm({ intentIds: [FIRST_ID] }, deps)

      const message = elicit.mock.calls[0][0]
      expect(message).toContain('set Decision first')
      expect(message).toContain('Accept does nothing while Decision is empty')
    })

    it('a cancelled dialog sends no decision request', async () => {
      routeIntents({ [FIRST_ID]: intentBody(FIRST_ID) }, approved)
      const withoutDecision: ElicitOutcome = { action: 'cancel' }
      elicit.mockResolvedValue(withoutDecision)

      const result = await beechConfirm({ intentIds: [FIRST_ID] }, deps)

      expect(result.status).toBe('cancelled')
      expect(result.results[0].outcome).toBe('pending')
      expect(send.mock.calls.filter(([method]) => method === 'POST')).toEqual([])
    })

    it('a rejected elicit promise becomes the elicitation_failed fallback', async () => {
      routeIntents({ [FIRST_ID]: intentBody(FIRST_ID) }, approved)
      elicit.mockRejectedValue(new Error('transport closed'))

      const result = await beechConfirm({ intentIds: [FIRST_ID] }, deps)

      expect(result.status).toBe('fallback')
      expect(result.reason).toBe('elicitation_failed')
      expect(result.instruction).toContain(deps.pendingActionsUrl)
      expect(send.mock.calls.filter(([method]) => method === 'POST')).toEqual([])
    })

    it('a 500 on one approval is reported as error and the next intent is still approved', async () => {
      routeIntents(
        { [FIRST_ID]: intentBody(FIRST_ID), [SECOND_ID]: intentBody(SECOND_ID) },
        id => (id === FIRST_ID ? json({ type: 'internal_error' }, 500) : approved()),
      )

      const result = await beechConfirm({ intentIds: [FIRST_ID, SECOND_ID] }, deps)

      expect(result.status).toBe('decided')
      expect(result.results.map(item => item.outcome)).toEqual(['error', 'executed'])
      expect(result.results[0].message).toContain('500')
    })

    it('a non-JSON 200 on one approval is reported as error and the next intent is still approved', async () => {
      routeIntents(
        { [FIRST_ID]: intentBody(FIRST_ID), [SECOND_ID]: intentBody(SECOND_ID) },
        id => (id === FIRST_ID ? new Response('<html>proxy</html>', { status: 200 }) : approved()),
      )

      const result = await beechConfirm({ intentIds: [FIRST_ID, SECOND_ID] }, deps)

      expect(result.status).toBe('decided')
      expect(result.results.map(item => item.outcome)).toEqual(['error', 'executed'])
      expect(result.results[0].resultStatus).toBe(200)
      expect(result.results[0].message).toContain('check the dashboard before retrying')
    })

    it('a rejection never reads the decision body', async () => {
      elicit.mockResolvedValue({ action: 'accept', decision: 'reject' })
      routeIntents({ [FIRST_ID]: intentBody(FIRST_ID) }, () => new Response('not json', { status: 200 }))

      const result = await beechConfirm({ intentIds: [FIRST_ID] }, deps)

      expect(result.results.map(item => item.outcome)).toEqual(['rejected'])
    })

    it('a long replay body is cut to 2000 characters', async () => {
      routeIntents(
        { [FIRST_ID]: intentBody(FIRST_ID) },
        () => json({ intent: {}, result: { status: 200, body: 'y'.repeat(5_000) } }),
      )

      const result = await beechConfirm({ intentIds: [FIRST_ID] }, deps)

      expect(result.results[0].resultBody).toBe('y'.repeat(CONFIRM_RESULT_PREVIEW_CHARS))
    })

    it('decide readback returns executed with resultStatus when POST approve loses connection after server recorded result', async () => {
      let getCount = 0
      send.mockImplementation(async (method, path) => {
        if (method === 'GET' && path === `/api/agent/intents/${FIRST_ID}`) {
          getCount++
          if (getCount === 1) return json(intentBody(FIRST_ID))
          return json(intentBody(FIRST_ID, { status: 'approved', result: { status: 201, body: { id: 'created-1' } } }))
        }
        throw new Error('socket hang up')
      })

      const result = await beechConfirm({ intentIds: [FIRST_ID] }, deps)

      expect(result.status).toBe('decided')
      expect(result.results[0]).toMatchObject({
        id: FIRST_ID,
        outcome: 'executed',
        resultStatus: 201,
        resultBody: { id: 'created-1' },
        message: null,
      })
      expect(send.mock.calls.filter(([method]) => method === 'POST')).toHaveLength(1)
    })

    it('decide readback returns awaiting_result without retrying when POST approve is interrupted after approved but before result persistence', async () => {
      let getCount = 0
      send.mockImplementation(async (method, path) => {
        if (method === 'GET' && path === `/api/agent/intents/${FIRST_ID}`) {
          getCount++
          if (getCount === 1) return json(intentBody(FIRST_ID))
          return json(intentBody(FIRST_ID, { status: 'approved', result: null }))
        }
        throw new Error('connection reset')
      })

      const result = await beechConfirm({ intentIds: [FIRST_ID] }, deps)

      expect(result.status).toBe('decided')
      expect(result.results[0]).toMatchObject({
        id: FIRST_ID,
        outcome: 'awaiting_result',
        resultStatus: null,
        resultBody: null,
      })
      expect(result.results[0].message).toContain('not resubmit')
      expect(send.mock.calls.filter(([method]) => method === 'POST')).toHaveLength(1)
    })

    it('decide returns error when POST approve fails and readback still sees pending or fails', async () => {
      send.mockImplementation(async method => {
        if (method === 'GET') return json(intentBody(FIRST_ID))
        throw new Error('ECONNRESET')
      })

      const result = await beechConfirm({ intentIds: [FIRST_ID] }, deps)

      expect(result.status).toBe('decided')
      expect(result.results[0]).toMatchObject({
        id: FIRST_ID,
        outcome: 'error',
        message: 'ECONNRESET',
      })
      expect(send.mock.calls.filter(([method]) => method === 'POST')).toHaveLength(1)
    })

    it('beechConfirm on an already approved intent without result returns awaiting_result instead of not_pending', async () => {
      routeIntents({ [FIRST_ID]: intentBody(FIRST_ID, { status: 'approved', result: null }) }, approved)

      const result = await beechConfirm({ intentIds: [FIRST_ID] }, deps)

      expect(result.status).toBe('nothing_pending')
      expect(result.results[0]).toMatchObject({
        id: FIRST_ID,
        outcome: 'awaiting_result',
        resultStatus: null,
      })
      expect(result.results[0].message).toContain('not resubmit')
      expect(elicit).not.toHaveBeenCalled()
    })
  })

  describe('beechIntents', () => {
    it('beechIntents with intentIds returns awaiting_result, executed, rejected, expired and not_found accurately', async () => {
      const thirdId = '11111111-1111-4111-8111-111111111111'
      const fourthId = '22222222-2222-4222-8222-222222222222'
      const fifthId = '33333333-3333-4333-8333-333333333333'
      const details: Record<string, Response> = {
        [FIRST_ID]: json(intentBody(FIRST_ID, { status: 'approved', result: null })),
        [SECOND_ID]: json(intentBody(SECOND_ID, { status: 'approved', result: { status: 200, body: { ok: true } } })),
        [thirdId]: json(intentBody(thirdId, { status: 'rejected', result: null })),
        [fourthId]: json(intentBody(fourthId, { status: 'pending', expiresAt: NOW_SECONDS - 10 })),
      }
      send.mockImplementation(async (_method, path) => {
        const id = path.split('/')[4]
        return details[id] ?? json({ type: 'not_found' }, 404)
      })

      const result = await beechIntents(deps, { intentIds: [FIRST_ID, SECOND_ID, thirdId, fourthId, fifthId] })

      expect(result.intents).toEqual([])
      expect(result.checked?.map(item => [item.id, item.outcome])).toEqual([
        [FIRST_ID, 'awaiting_result'],
        [SECOND_ID, 'executed'],
        [thirdId, 'rejected'],
        [fourthId, 'expired'],
        [fifthId, 'not_found'],
      ])
      expect(result.checked?.[1]).toMatchObject({ resultStatus: 200, resultBody: { ok: true } })
    })
  })

  describe('mapElicitResult', () => {
    it('an accepted approve maps to accept with decision approve', () => {
      const outcome = mapElicitResult({ action: 'accept', content: { decision: 'approve' } })

      expect(outcome).toEqual({ action: 'accept', decision: 'approve' })
    })

    it('an accepted reject maps to accept with decision reject', () => {
      const outcome = mapElicitResult({ action: 'accept', content: { decision: 'reject' } })

      expect(outcome).toEqual({ action: 'accept', decision: 'reject' })
    })

    it('an accepted answer without a decision maps to cancel', () => {
      const outcome = mapElicitResult({ action: 'accept' })

      expect(outcome).toEqual({ action: 'cancel' })
    })

    it('an accepted answer with an unknown decision maps to cancel', () => {
      const outcome = mapElicitResult({ action: 'accept', content: { decision: 'yes' } })

      expect(outcome).toEqual({ action: 'cancel' })
    })

    it('a non-string decision maps to cancel', () => {
      const outcome = mapElicitResult({ action: 'accept', content: { decision: true } })

      expect(outcome).toEqual({ action: 'cancel' })
    })

    it('decline maps to decline', () => {
      const outcome = mapElicitResult({ action: 'decline' })

      expect(outcome).toEqual({ action: 'decline' })
    })

    it('an unknown action maps to cancel', () => {
      const outcome = mapElicitResult({ action: 'later' })

      expect(outcome).toEqual({ action: 'cancel' })
    })
  })

  describe('beechWhoami', () => {
    it('an insufficient_scope answer names the missing scope', async () => {
      send.mockImplementation(async (_method, path) =>
        path === '/api/settings/me'
          ? json({ error: 'insufficient_scope', error_description: "This endpoint requires the 'settings:read' scope." }, 403)
          : json({ userId: 'u', clientId: 'beech-mcp', scopes: [], environment: 'development', confirmation: { publish: false, destructive: true }, schemaVersion: 1 }),
      )

      const attempt = beechWhoami(deps)

      await expect(attempt).rejects.toThrow("'settings:read'")
    })
  })
})
