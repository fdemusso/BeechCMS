import { describe, it, expect, vi, beforeEach } from 'vitest'
import { executeAction } from '../action-executors'
import type { ActionContext } from '../action-executors'
import type { ContentRepository, Seed, IIdGenerator } from '@beechcms/core'

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
  beforeEach(() => { vi.restoreAllMocks() })

  it('POSTs to URL with JSON body derived from entry when no body_template', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)

    const ctx = makeCtx()
    await executeAction({ type: 'webhook', url: 'https://example.com/hook' }, ctx)

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://example.com/hook')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toMatchObject({ id: 'entry-1', title: 'Test Entry' })
  })

  it('interpolates body_template with entry values', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    const ctx = makeCtx()
    await executeAction({ type: 'webhook', url: 'https://example.com/hook', body_template: '{"t":"{{title}}"}' }, ctx)

    const [, init] = fetchMock.mock.calls[0]
    expect(init.body).toBe('{"t":"Test Entry"}')
  })

  it('merges custom headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    const ctx = makeCtx()
    await executeAction({ type: 'webhook', url: 'https://x.com', headers: { 'X-Token': 'abc' } }, ctx)

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers['X-Token']).toBe('abc')
  })

  it('throws when response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    const ctx = makeCtx()
    await expect(executeAction({ type: 'webhook', url: 'https://x.com' }, ctx)).rejects.toThrow('500')
  })

  it('uses custom HTTP method', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    const ctx = makeCtx()
    await executeAction({ type: 'webhook', url: 'https://x.com', method: 'PUT' }, ctx)
    expect(fetchMock.mock.calls[0][1].method).toBe('PUT')
  })
})

// ── send_mail ─────────────────────────────────────────────────────────────────

vi.mock('../../email', () => ({
  sendAutomationMail: vi.fn().mockResolvedValue(undefined),
}))

describe('send_mail executor', () => {
  beforeEach(async () => {
    const { sendAutomationMail } = await import('../../email')
    vi.mocked(sendAutomationMail).mockClear()
  })

  it('interpolates to/subject/body and calls sendAutomationMail', async () => {
    const { sendAutomationMail } = await import('../../email')
    const ctx = makeCtx({ entry: { id: '1', email: 'user@example.com', title: 'Hello' } })

    await executeAction(
      {
        type: 'send_mail',
        to: '{{email}}',
        subject_template: 'Re: {{title}}',
        body_template: 'Your entry {{title}} was created.',
      },
      ctx,
    )

    expect(sendAutomationMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: 'Re: Hello',
        body: 'Your entry Hello was created.',
      }),
    )
  })

  it('supports single brace notation {campo} with spaces to avoid excess parentheses', async () => {
    const { sendAutomationMail } = await import('../../email')
    const ctx = makeCtx({ entry: { id: '1', 'author.email': 'admin@beech.io', name: 'Flavio' } })

    await executeAction(
      {
        type: 'send_mail',
        to: '{ author.email }',
        subject_template: 'Notification for {name}',
        body_template: 'Hello { name }',
      },
      ctx,
    )

    expect(sendAutomationMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'admin@beech.io',
        subject: 'Notification for Flavio',
        body: 'Hello Flavio',
      }),
    )
  })

  it('substitutes default value [missing] and logs a warning when concrete data is absent', async () => {
    const { sendAutomationMail } = await import('../../email')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ctx = makeCtx({ entry: { id: '1' } }) // missing email and title

    await executeAction(
      {
        type: 'send_mail',
        to: '{email}',
        subject_template: 'Re: {title}',
        body_template: 'Content: {desc}',
      },
      ctx,
    )

    expect(sendAutomationMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '[missing]',
        subject: 'Re: [missing]',
        body: 'Content: [missing]',
      }),
    )
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('missing concrete data'),
      ['email', 'title', 'desc'],
    )
  })

  it('skips execution gracefully and logs an error without calling sendAutomationMail if apiKey is missing', async () => {
    const { sendAutomationMail } = await import('../../email')
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const ctx = makeCtx({ env: {} }) // missing email/resend api keys

    await executeAction(
      {
        type: 'send_mail',
        to: 'user@beech.io',
        subject_template: 'Hello',
        body_template: 'World',
      },
      ctx,
    )

    expect(sendAutomationMail).not.toHaveBeenCalled()
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Execution skipped'))
  })

  it('logs error and rethrows when sendAutomationMail fails', async () => {
    const { sendAutomationMail } = await import('../../email')
    vi.mocked(sendAutomationMail).mockRejectedValueOnce(new Error('provider error'))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const ctx = makeCtx()

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
    ).rejects.toThrow('provider error')

    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('failed to send automation email'),
      expect.any(Error),
    )
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
