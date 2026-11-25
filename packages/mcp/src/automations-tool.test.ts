// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, expect, it, vi } from 'vitest'
import { AgentToolError } from './agent-tools.js'
import { AUTOMATIONS_GUIDE, beechAutomations, type AutomationsToolDeps } from './automations-tool.js'

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('beechAutomations', () => {
  it('returns the automation schema and limits without an API call when seed is omitted', async () => {
    const send = vi.fn<AutomationsToolDeps['send']>()

    const result = await beechAutomations({}, { send })

    expect(send).not.toHaveBeenCalled()
    expect(result.automations).toBeUndefined()
    expect(result.schema).toBe(AUTOMATIONS_GUIDE)
    expect(result.schema.templating.interpolatedFields).toContain('send_mail.to')
  })

  it('fetches automations for the requested seed and attaches the schema', async () => {
    const existing = [{ id: 'a1', seed_slug: 'orders', name: 'Notify', enabled: true }]
    const send = vi.fn<AutomationsToolDeps['send']>().mockResolvedValueOnce(json(existing))

    const result = await beechAutomations({ seed: 'orders' }, { send })

    expect(send).toHaveBeenCalledWith('GET', '/api/automations?seed=orders')
    expect(result.seed).toBe('orders')
    expect(result.automations).toEqual(existing)
    expect(result.schema).toBe(AUTOMATIONS_GUIDE)
  })

  it('rejects an empty or non-string seed before making any request', async () => {
    const send = vi.fn<AutomationsToolDeps['send']>()

    await expect(beechAutomations({ seed: '  ' }, { send })).rejects.toBeInstanceOf(AgentToolError)
    await expect(beechAutomations({ seed: 123 }, { send })).rejects.toBeInstanceOf(AgentToolError)
    expect(send).not.toHaveBeenCalled()
  })

  it('surfaces an actionable re-consent error on 403 insufficient_scope', async () => {
    const send = vi.fn<AutomationsToolDeps['send']>().mockResolvedValueOnce(
      json({ error: 'insufficient_scope', error_description: "Missing 'automations:read'" }, 403),
    )

    await expect(beechAutomations({ seed: 'orders' }, { send })).rejects.toThrow("Token lacks the 'automations:read' scope.")
  })
})
