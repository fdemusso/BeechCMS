// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBeechForm } from '../hooks/useBeechForm.js'
import type { FormSeedSchema } from '../types.js'
import { saveFormDraft } from '../core/draft-storage.js'

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
    expect(addCall[1]?.headers?.['X-API-Key']).toBeUndefined()
    expect(addCall[1]?.headers?.['x-time-trap']).toBe('t0_1000.abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234')
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
