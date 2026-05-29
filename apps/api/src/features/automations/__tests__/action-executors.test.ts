// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { executeAction } from '../action-executors'
import type { ActionContext } from '../action-executors'
import type { ContentRepository, Seed, IIdGenerator } from '@beechcms/core'
import { deleteAllMessages, listMessages, waitForMessage, getMessageHtml } from '../../../../test/helpers/mailpit-client'
import { newBucket, waitForRequest } from '../../../../test/helpers/webhook-tester-client'

// ── Shared mock context factory ───────────────────────────────────────────────

function makeCtx(overrides: Partial<ActionContext> = {}): ActionContext {
  const { entry: entryOverride, context: contextOverride, ...rest } = overrides
  const entry: Record<string, unknown> = entryOverride ?? { id: 'entry-1', title: 'Test Entry', status: 'published' }
  const context = contextOverride ?? {
    triggerEntry: entry,
    lookup(parsed: import('../template-grammar').ParsedKey, onMissing?: (f: string) => void) {
      if (parsed.kind === 'simple') {
        const val = entry[parsed.path]
        if (val == null && onMissing) onMissing(parsed.path)
        return val
      }
      if (parsed.kind === 'scoped' && parsed.scope === 'this' && parsed.field) {
        return entry[parsed.field]
      }
      return undefined
    },
  }
  return {
    entry,
    env: { RESEND_API_KEY: 'test-key', EMAIL_FROM: 'test@example.com' },
    repository: {
      update: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue(undefined),
    } as unknown as ContentRepository,
    getSeed: vi.fn().mockReturnValue({ branches: [] } as unknown as Seed),
    seed: { slug: 'posts', branches: [] } as unknown as Seed,
    idGenerator: { uuid: vi.fn().mockReturnValue('new-id-123') } as unknown as IIdGenerator,
    context,
    variables: {},
    ...rest,
  }
}

// ── webhook ───────────────────────────────────────────────────────────────────

describe('webhook executor', () => {
  it('POSTs to URL with interpolated body_template', async () => {
    const { url, uuid } = await newBucket()
    const ctx = makeCtx()
    await executeAction({ type: 'webhook', url, body_template: '{"id":"{{id}}","title":"{{title}}"}' }, ctx)
    const req = await waitForRequest(uuid)
    expect(req.method).toBe('POST')
    expect(JSON.parse(req.body)).toMatchObject({ id: 'entry-1', title: 'Test Entry' })
  })

  it('interpolates body_template with entry values', async () => {
    const { url, uuid } = await newBucket()
    const ctx = makeCtx()
    await executeAction({ type: 'webhook', url, body_template: '{"t":"{{title}}"}' }, ctx)
    const req = await waitForRequest(uuid)
    expect(req.body).toBe('{"t":"Test Entry"}')
  })

  it('merges custom headers', async () => {
    const { url, uuid } = await newBucket()
    const ctx = makeCtx()
    await executeAction({ type: 'webhook', url, headers: { 'X-Token': 'abc' } }, ctx)
    const req = await waitForRequest(uuid)
    expect(req.headers['x-token']).toBe('abc')
  })

  it('throws when webhook endpoint is unreachable', async () => {
    const ctx = makeCtx()
    await expect(executeAction({ type: 'webhook', url: 'http://localhost:19999/nope' }, ctx)).rejects.toThrow()
  })

  it('uses custom HTTP method', async () => {
    const { url, uuid } = await newBucket()
    const ctx = makeCtx()
    await executeAction({ type: 'webhook', url, method: 'PUT' }, ctx)
    const req = await waitForRequest(uuid)
    expect(req.method).toBe('PUT')
  })
})

// ── send_mail ─────────────────────────────────────────────────────────────────

describe('send_mail executor', () => {
  beforeEach(() => deleteAllMessages())

  it('interpolates to/subject/body and delivers to Mailpit', async () => {
    const ctx = makeCtx({
      entry: { id: '1', email: 'user@example.com', title: 'Hello' },
      env: { EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'localhost', SMTP_PORT: '8025', EMAIL_FROM: 'Beech <test@beech.local>' },
    })

    await executeAction(
      {
        type: 'send_mail',
        to: '{{email}}',
        subject_template: 'Re: {{title}}',
        body_template: 'Your entry {{title}} was created.',
      },
      ctx,
    )

    const msg = await waitForMessage(m => m.To.some(t => t.Address === 'user@example.com'))
    expect(msg.Subject).toBe('Re: Hello')
    const html = await getMessageHtml(msg.ID)
    expect(html).toContain('Hello')
  })

  it('substitutes [missing] for absent fields and logs a warning', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // email is present (needed for a valid To address) but title and desc are absent
    const ctx = makeCtx({
      entry: { id: '1', email: 'warn-test@example.com' },
      env: { EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'localhost', SMTP_PORT: '8025', EMAIL_FROM: 'Beech <test@beech.local>' },
    })

    await executeAction(
      {
        type: 'send_mail',
        to: '{{email}}',
        subject_template: 'Re: {{title}}',
        body_template: 'Content: {{desc}}',
      },
      ctx,
    )

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('missing concrete data'),
      expect.arrayContaining(['title', 'desc']),
    )
    const msg = await waitForMessage(m => m.Subject === 'Re: [missing]')
    expect(msg.Subject).toBe('Re: [missing]')
    const html = await getMessageHtml(msg.ID)
    expect(html).toContain('[missing]')
    warnSpy.mockRestore()
  })

  it('skips execution and logs an error when provider is resend and apiKey is missing', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const ctx = makeCtx({ env: {} })

    await executeAction(
      {
        type: 'send_mail',
        to: 'user@beech.io',
        subject_template: 'Hello',
        body_template: 'World',
      },
      ctx,
    )

    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Execution skipped'))
    const msgs = await listMessages()
    expect(msgs).toHaveLength(0)
    errSpy.mockRestore()
  })

  it('logs error and rethrows when SMTP provider is unreachable', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const ctx = makeCtx({
      env: { EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'localhost', SMTP_PORT: '19999', EMAIL_FROM: 'Beech <test@beech.local>' },
    })

    await expect(
      executeAction(
        {
          type: 'send_mail',
          to: 'test@beech.io',
          subject_template: 'Hello',
          body_template: 'World',
        },
        ctx,
      ),
    ).rejects.toThrow()

    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('failed to send automation email'),
      expect.any(Error),
    )
    errSpy.mockRestore()
  })
})

// ── edit_field ────────────────────────────────────────────────────────────────

describe('edit_field executor', () => {
  it('calls repository.update with interpolated string value', async () => {
    const ctx = makeCtx({ entry: { id: 'entry-1', title: 'Old Title' } })
    await executeAction({ type: 'edit_field', field: 'summary', value: 'Based on {{title}}' }, ctx)
    expect(ctx.repository.update).toHaveBeenCalledWith(ctx.seed, 'entry-1', { summary: 'Based on Old Title' })
  })

  it('calls repository.update with raw non-string value', async () => {
    const ctx = makeCtx({ entry: { id: 'entry-1', title: 'T' } })
    await executeAction({ type: 'edit_field', field: 'count', value: 42 }, ctx)
    expect(ctx.repository.update).toHaveBeenCalledWith(ctx.seed, 'entry-1', { count: 42 })
  })

  it('throws when entry.id is missing', async () => {
    const ctx = makeCtx({ entry: { title: 'No ID' } })
    await expect(executeAction({ type: 'edit_field', field: 'x', value: 'y' }, ctx)).rejects.toThrow('entry.id missing')
  })
})

// ── create_entry ──────────────────────────────────────────────────────────────

describe('create_entry executor', () => {
  it('creates a new entry with field_map values from trigger entry', async () => {
    const ctx = makeCtx({ entry: { id: 'e1', author: 'Alice' } })
    await executeAction(
      { type: 'create_entry', seed_slug: 'comments', field_map: { writer: 'author', fixed: 'literal-value' } },
      ctx,
    )
    expect(ctx.idGenerator.uuid).toHaveBeenCalled()
    expect(ctx.repository.create).toHaveBeenCalledWith(
      expect.anything(),
      'new-id-123',
      'new-id-123',
      'draft',
      { writer: 'Alice', fixed: 'literal-value' },
    )
  })

  it('uses literal string when source field is not in entry', async () => {
    const ctx = makeCtx({ entry: { id: 'e1' } })
    await executeAction(
      { type: 'create_entry', seed_slug: 'comments', field_map: { tag: 'missing-field' } },
      ctx,
    )
    expect(ctx.repository.create).toHaveBeenCalledWith(
      expect.anything(), 'new-id-123', 'new-id-123', 'draft',
      { tag: 'missing-field' },
    )
  })

  it('throws when seed not found', async () => {
    const ctx = makeCtx({ getSeed: vi.fn().mockReturnValue(null) })
    await expect(
      executeAction({ type: 'create_entry', seed_slug: 'unknown', field_map: {} }, ctx),
    ).rejects.toThrow('unknown seed unknown')
  })

  it('throws error for unknown action type to cover exhaustive default check', async () => {
    const ctx = makeCtx()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(executeAction({ type: 'unknown_custom_action' } as any, ctx)).rejects.toThrow('unknown action type')
  })
})
