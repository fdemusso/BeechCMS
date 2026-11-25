// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useBeechForm } from '../hooks/useBeechForm.js'
import type { FormSeedSchema } from '../types.js'
import { getDraftStorageKey, loadFormDraft, saveFormDraft } from '../core/draft-storage.js'

describe('useBeechForm', () => {
  const mockSchema: FormSeedSchema = {
    slug: 'contact-us',
    branches: [
      { alias: 'fullName', type: 'string', required: true },
      { alias: 'email', type: 'email', required: true },
      { alias: 'age', type: 'number' },
      {
        alias: 'companyName',
        type: 'string',
        dependsOn: { field: 'fullName', op: 'eq', value: 'Business' },
      },
    ],
  }

  beforeEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it('initializes with default values and schema', () => {
    const { result } = renderHook(() =>
      useBeechForm({
        seed: mockSchema,
        initialValues: { fullName: 'John' },
      })
    )

    expect(result.current.seedSlug).toBe('contact-us')
    expect(result.current.values.fullName).toBe('John')
    expect(result.current.isSubmitting).toBe(false)
    expect(result.current.isSuccess).toBe(false)
  })

  it('restores draft from localStorage on mount', () => {
    saveFormDraft('contact-us', { fullName: 'Drafted User', email: 'draft@test.com' })

    const { result } = renderHook(() =>
      useBeechForm({
        seed: mockSchema,
      })
    )

    expect(result.current.values.fullName).toBe('Drafted User')
    expect(result.current.values.email).toBe('draft@test.com')
    expect(result.current.isDraftRestored).toBe(true)
  })

  it('updates field value and clear errors on change', () => {
    const { result } = renderHook(() =>
      useBeechForm({
        seed: mockSchema,
      })
    )

    act(() => {
      result.current.setFieldError('fullName', 'Required')
    })
    expect(result.current.errors.fullName).toBe('Required')

    act(() => {
      result.current.setFieldValue('fullName', 'Alice')
    })
    expect(result.current.values.fullName).toBe('Alice')
    expect(result.current.errors.fullName).toBeUndefined()
  })

  it('evaluates dynamic field visibility correctly', () => {
    const { result } = renderHook(() =>
      useBeechForm({
        seed: mockSchema,
      })
    )

    expect(result.current.isFieldVisible('companyName')).toBe(false)

    act(() => {
      result.current.setFieldValue('fullName', 'Business')
    })
    expect(result.current.isFieldVisible('companyName')).toBe(true)
  })

  it('validates required, email, and number formats', async () => {
    const { result } = renderHook(() =>
      useBeechForm({
        seed: mockSchema,
        disableAntiBot: true,
      })
    )

    let success = false
    await act(async () => {
      success = await result.current.handleSubmit()
    })

    expect(success).toBe(false)
    expect(result.current.errors.fullName).toBeDefined()
    expect(result.current.errors.email).toBeDefined()

    // Provide invalid email & number
    act(() => {
      result.current.setFieldValue('fullName', 'John')
      result.current.setFieldValue('email', 'not-an-email')
      result.current.setFieldValue('age', 'not-a-number')
    })

    await act(async () => {
      success = await result.current.handleSubmit()
    })
    expect(success).toBe(false)
    expect(result.current.errors.email).toBe('Inserisci un indirizzo email valido')
    expect(result.current.errors.age).toBe('Inserisci un valore numerico valido')
  })

  it('rejects submission if honeypot trap is filled by bot', async () => {
    const onError = vi.fn()
    const { result } = renderHook(() =>
      useBeechForm({
        seed: mockSchema,
        disableAntiBot: true,
        onError,
      })
    )

    act(() => {
      result.current.setFieldValue('fullName', 'John')
      result.current.setFieldValue('email', 'john@example.com')
      result.current.setHoneypotValue('bot-input')
    })

    let res = false
    await act(async () => {
      res = await result.current.handleSubmit()
    })

    expect(res).toBe(false)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ status: 422 }))
  })

  it('submits valid payload and clears draft on success', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: 'rec_123' } }),
    })
    globalThis.fetch = mockFetch

    const onSuccess = vi.fn()
    const { result } = renderHook(() =>
      useBeechForm({
        seed: mockSchema,
        baseUrl: 'https://api.example.com',
        disableAntiBot: true,
        onSuccess,
      })
    )

    act(() => {
      result.current.setFieldValue('fullName', 'Jane Doe')
      result.current.setFieldValue('email', 'jane@example.com')
    })

    let success = false
    await act(async () => {
      success = await result.current.handleSubmit()
    })

    expect(success).toBe(true)
    expect(result.current.isSuccess).toBe(true)
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'rec_123', data: expect.objectContaining({ fullName: 'Jane Doe' }) })
    )
  })

  it('performs Zero-Secret public submission with automatic time-trap token lifecycle', async () => {
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/timetrap/token')) {
        return {
          ok: true,
          json: async () => ({ token: 't0_1000.abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234', minDeltaSeconds: 1.5 }),
        }
      }
      if (url.endsWith('/contact-us/add')) {
        return {
          ok: true,
          json: async () => ({ data: { id: 'zero_sec_rec_1' } }),
        }
      }
      return { ok: false }
    })
    globalThis.fetch = mockFetch

    const onSuccess = vi.fn()
    const { result } = renderHook(() =>
      useBeechForm({
        seed: mockSchema,
        baseUrl: 'https://api.example.com',
        onSuccess,
      })
    )

    // Wait for time-trap token to be loaded asynchronously
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    expect(result.current.timeTrapReady).toBe(true)

    act(() => {
      result.current.setFieldValue('fullName', 'Zero Secret User')
      result.current.setFieldValue('email', 'zero@example.com')
    })

    // Simulate elapsed human time (> 1.5s)
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 2000)

    let success = false
    await act(async () => {
      success = await result.current.handleSubmit()
    })

    expect(success).toBe(true)
    expect(result.current.isSuccess).toBe(true)
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'zero_sec_rec_1' })
    )

    // Verify fetch was called without X-API-Key and with time-trap token
    const addCall = mockFetch.mock.calls.find((c) => c[0].endsWith('/contact-us/add'))
    expect(addCall).toBeDefined()
    expect(addCall?.[1]?.headers?.['X-API-Key']).toBeUndefined()
    expect(addCall?.[1]?.headers?.['x-time-trap']).toBe('t0_1000.abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234')
  })

  describe('draft persistence', () => {
    const draftKey = getDraftStorageKey('contact-us')

    const classifiedSchema: FormSeedSchema = {
      slug: 'contact-us',
      branches: [
        { alias: 'fullName', type: 'string' },
        { alias: 'email', type: 'email', classification: 'confidential' },
        { alias: 'note', type: 'string' },
      ],
    }

    it('a branch classified above public never reaches the stored draft', () => {
      const { result } = renderHook(() => useBeechForm({ seed: classifiedSchema }))

      act(() => {
        result.current.setFieldValue('fullName', 'Mario Rossi')
        result.current.setFieldValue('email', 'mario@secret.test')
      })

      expect(window.localStorage.getItem(draftKey)).not.toContain('mario@secret.test')
      expect(loadFormDraft('contact-us')).toEqual({ fullName: 'Mario Rossi' })
    })

    it('a classification delivered by the fetched public schema keeps that branch out of the draft', async () => {
      window.sessionStorage.clear()
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          slug: 'contact-us',
          branches: [
            { alias: 'fullName', type: 'text', policies: { classification: 'public' } },
            { alias: 'email', type: 'text', policies: { classification: 'confidential' } },
          ],
        }),
      })
      const { result } = renderHook(() =>
        useBeechForm({ seed: 'contact-us', baseUrl: 'https://api.example.com', disableAntiBot: true })
      )
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
      })

      act(() => {
        result.current.setFieldValue('fullName', 'Mario Rossi')
        result.current.setFieldValue('email', 'mario@secret.test')
      })

      expect(window.localStorage.getItem(draftKey)).not.toContain('mario@secret.test')
      expect(window.localStorage.getItem(draftKey)).toContain('Mario Rossi')
    })

    it('excludeFromDraft keeps the listed fields out of the stored draft', () => {
      const { result } = renderHook(() =>
        useBeechForm({ seed: classifiedSchema, excludeFromDraft: ['note'] })
      )

      act(() => {
        result.current.setFieldValue('fullName', 'Mario Rossi')
        result.current.setFieldValue('note', 'call me at 555-0100')
      })

      expect(window.localStorage.getItem(draftKey)).not.toContain('555-0100')
      expect(window.localStorage.getItem(draftKey)).toContain('Mario Rossi')
    })

    it('a draft past its TTL is neither restored nor kept in localStorage', () => {
      saveFormDraft('contact-us', { fullName: 'Stale User' }, { ttlMs: 1000, now: Date.now() - 5000 })

      const { result } = renderHook(() => useBeechForm({ seed: classifiedSchema }))

      expect(result.current.values.fullName).toBeUndefined()
      expect(result.current.isDraftRestored).toBe(false)
      expect(window.localStorage.getItem(draftKey)).not.toContain('Stale User')
    })
  })

  describe('tags branch payload', () => {
    const tagsSchema: FormSeedSchema = {
      slug: 'tickets',
      branches: [
        {
          alias: 'priority',
          type: 'select',
          arrayValue: true,
          options: [
            { label: 'low', value: 'low', color: '#64748b' },
            { label: 'high', value: 'high', color: '#ef4444' },
          ],
        },
      ],
    }

    function renderTicketForm(priority: string) {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { id: 'rec_1' } }) })
      globalThis.fetch = mockFetch
      const { result } = renderHook(() =>
        useBeechForm({ seed: tagsSchema, baseUrl: 'https://api.example.com', disableAntiBot: true })
      )
      act(() => {
        result.current.setFieldValue('priority', priority)
      })
      return { result, mockFetch }
    }

    function submittedPriority(mockFetch: ReturnType<typeof vi.fn>): unknown {
      const addCall = mockFetch.mock.calls.find((call) => String(call[0]).endsWith('/tickets/add'))
      expect(addCall).toBeDefined()
      return (JSON.parse(addCall?.[1].body) as { data: Record<string, unknown> }).data.priority
    }

    it('submits the chosen option as a one-element array', async () => {
      const { result, mockFetch } = renderTicketForm('high')

      let success = false
      await act(async () => {
        success = await result.current.handleSubmit()
      })

      expect(success).toBe(true)
      const submitted = submittedPriority(mockFetch)
      expect(submitted).toEqual(['high'])
    })

    it('submits an empty choice as an empty array', async () => {
      const { result, mockFetch } = renderTicketForm('')

      let success = false
      await act(async () => {
        success = await result.current.handleSubmit()
      })

      expect(success).toBe(true)
      const submitted = submittedPriority(mockFetch)
      expect(submitted).toEqual([])
    })
  })

  it('resets form state back to initial', () => {
    const { result } = renderHook(() =>
      useBeechForm({
        seed: mockSchema,
        initialValues: { fullName: 'Initial' },
      })
    )

    act(() => {
      result.current.setFieldValue('fullName', 'Changed')
      result.current.setFieldError('fullName', 'Some Error')
    })

    act(() => {
      result.current.reset()
    })

    expect(result.current.values.fullName).toBe('Initial')
    expect(result.current.errors).toEqual({})
  })
})

describe('useBeechForm — time-trap token lifecycle', () => {
  const schema: FormSeedSchema = { slug: 'contact-us', branches: [{ alias: 'fullName', type: 'string', required: true }] }
  // Server rules (public-add.ts): a token is single use, valid from 1.5 s to 3600 s after it was issued.
  const HUMAN_DELAY_MS = 2_000
  const TOKEN_TTL_MS = 3_600_000

  let nowMs: number
  const clock = { now: () => nowMs }
  let issued: string[]
  let sentTokens: Array<string | undefined>
  let addStatuses: number[]

  function routeFetch() {
    return vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/timetrap/token')) {
        const token = `t0_${issued.length + 1}.${'ab'.repeat(32)}`
        issued.push(token)
        return new Response(JSON.stringify({ token }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      sentTokens.push((JSON.parse(String(init?.body)) as { _timeTrapToken?: string })._timeTrapToken)
      const status = addStatuses.shift() ?? 201
      const body = status < 300 ? { data: { id: 'rec_1' } } : { type: 'https://beechcms.dev/problems/internal-server-error', detail: 'boom' }
      return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
    })
  }

  async function mountForm() {
    const hook = renderHook(() => useBeechForm({ seed: schema, baseUrl: 'https://api.example.com', disableDraft: true, clock }))
    await waitFor(() => expect(hook.result.current.timeTrapReady).toBe(true))
    return hook
  }

  async function fillAndSubmit(result: { current: ReturnType<typeof useBeechForm> }): Promise<boolean> {
    act(() => result.current.setFieldValue('fullName', 'Jane'))
    nowMs += HUMAN_DELAY_MS
    let ok = false
    await act(async () => {
      ok = await result.current.handleSubmit()
    })
    await waitFor(() => expect(issued.length).toBeGreaterThan(sentTokens.length))
    return ok
  }

  beforeEach(() => {
    nowMs = 1_700_000_000_000
    issued = []
    sentTokens = []
    addStatuses = []
    globalThis.fetch = routeFetch() as unknown as typeof fetch
  })

  it('a second submit after reset() carries a fresh token instead of the consumed one', async () => {
    const { result } = await mountForm()
    await fillAndSubmit(result)
    act(() => result.current.reset())

    const secondOk = await fillAndSubmit(result)

    expect(secondOk).toBe(true)
    expect(sentTokens).toEqual([issued[0], issued[1]])
  })

  it('a retry after a failed insert carries a new token', async () => {
    addStatuses = [500, 201]
    const { result } = await mountForm()
    const firstOk = await fillAndSubmit(result)

    const retryOk = await fillAndSubmit(result)

    expect(firstOk).toBe(false)
    expect(retryOk).toBe(true)
    expect(sentTokens).toEqual([issued[0], issued[1]])
  })

  it('a token older than the server window is replaced before it is sent', async () => {
    const { result } = await mountForm()
    act(() => result.current.setFieldValue('fullName', 'Jane'))
    nowMs += TOKEN_TTL_MS

    let staleOk = true
    await act(async () => {
      staleOk = await result.current.handleSubmit()
    })

    // The fresh token is younger than the 1.5 s minimum, so this submit stops at the client-side warning.
    expect(staleOk).toBe(false)
    expect(result.current.serverError).toBe(result.current.translations.timeTrapWarning)
    expect(issued).toHaveLength(2)
    expect(sentTokens).toEqual([])
  })
})

describe('useBeechForm — server validation errors', () => {
  const schema: FormSeedSchema = {
    slug: 'contact-us',
    branches: [
      { alias: 'fullName', type: 'string', required: true },
      { alias: 'age', type: 'number' },
    ],
  }

  // Shape of public-add.ts 400 validation-failed: errors[] are core ValidationDetail entries.
  function answer(status: number, body: Record<string, unknown>) {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/problem+json' } })
    ) as unknown as typeof fetch
  }

  async function submitFilled() {
    const { result } = renderHook(() => useBeechForm({ seed: schema, baseUrl: 'https://api.example.com', disableAntiBot: true, disableDraft: true }))
    act(() => result.current.setFieldValue('fullName', 'Jane'))
    let ok = true
    await act(async () => {
      ok = await result.current.handleSubmit()
    })
    return { result, ok }
  }

  it('puts each errors[] entry on its field and shows it without a banner', async () => {
    answer(400, {
      type: 'https://beechcms.dev/problems/validation-failed',
      detail: 'Validation failed',
      errors: [{ field: 'age', expected: 'number(min:18)', received: '12', message: 'Must be at least 18' }],
    })

    const { result, ok } = await submitFilled()

    expect(ok).toBe(false)
    expect(result.current.errors.age).toBe('Must be at least 18')
    // FormField renders an error only for a touched field, so a server error must mark it touched.
    expect(result.current.touched.age).toBe(true)
    expect(result.current.serverError).toBeNull()
  })

  it('an errors[] entry for an unknown field goes to the banner', async () => {
    answer(400, {
      type: 'https://beechcms.dev/problems/validation-failed',
      detail: 'Validation failed',
      errors: [
        { field: 'age', expected: 'number', received: 'string', message: 'Must be a number' },
        { field: 'internalNotes', expected: 'string', received: 'null', message: 'Notes are required' },
      ],
    })

    const { result } = await submitFilled()

    expect(result.current.errors.age).toBe('Must be a number')
    expect(result.current.errors.internalNotes).toBeUndefined()
    expect(result.current.serverError).toBe('Notes are required')
  })

  it('a problem without errors[] keeps the generic banner', async () => {
    answer(409, { type: 'https://beechcms.dev/problems/slug-conflict', detail: 'An entry with slug jane already exists' })

    const { result } = await submitFilled()

    expect(result.current.serverError).toBe('An entry with slug jane already exists')
    expect(result.current.errors).toEqual({})
  })
})

describe('useBeechForm — register accessibility attributes', () => {
  const schema: FormSeedSchema = { slug: 'a11y', branches: [{ alias: 'email', type: 'email', required: true }] }

  it('an error on an untouched field does not point aria-describedby at a message that is not rendered', () => {
    const { result } = renderHook(() => useBeechForm({ seed: schema, disableDraft: true }))
    act(() => result.current.setFieldError('email', 'Invalid'))

    const attrs = result.current.register('email')

    // FormField renders the #email-error message only once the field is touched.
    expect(attrs['aria-describedby']).toBeUndefined()
    expect(attrs['aria-invalid']).toBe(false)
  })

  it('a touched field with an error is invalid and described by its message', () => {
    const { result } = renderHook(() => useBeechForm({ seed: schema, disableDraft: true }))
    act(() => {
      result.current.setFieldError('email', 'Invalid')
      result.current.setFieldTouched('email')
    })

    const attrs = result.current.register('email')

    expect(attrs).toMatchObject({ 'aria-invalid': true, 'aria-describedby': 'email-error' })
  })
})

