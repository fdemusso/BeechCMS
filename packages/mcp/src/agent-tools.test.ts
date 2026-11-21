// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentToolError, beechConfirm, beechWhoami, type AgentToolDeps, type ElicitOutcome } from './agent-tools.js'
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

    it('an accepted dialog without a decision is treated as cancelled and sends no decision request', async () => {
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

    it('a long replay body is cut to 2000 characters', async () => {
      routeIntents(
        { [FIRST_ID]: intentBody(FIRST_ID) },
        () => json({ intent: {}, result: { status: 200, body: 'y'.repeat(5_000) } }),
      )

      const result = await beechConfirm({ intentIds: [FIRST_ID] }, deps)

      expect(result.results[0].resultBody).toBe('y'.repeat(CONFIRM_RESULT_PREVIEW_CHARS))
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
