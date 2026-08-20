// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BeechForm } from '../components/BeechForm.js'
import { CLIENTI_SEED_SCHEMA } from '../examples/ClientiTestPage.js'

describe('Clienti Seed Form Integration E2E Test', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it('renders all schema-driven fields for the clienti Seed', () => {
    render(<BeechForm seed={CLIENTI_SEED_SCHEMA} />)

    // Verify fields derived from 'clienti' seed schema in D1
    expect(screen.getByLabelText(/Ragione Sociale \/ Nome Contatto/i)).toBeDefined()
    expect(screen.getByLabelText(/^Email Aziendale/i)).toBeDefined()
    expect(screen.getByLabelText(/^Azienda$/i)).toBeDefined()
    expect(screen.getByLabelText(/Piano Richiesto/i)).toBeDefined()
    expect(screen.getByLabelText(/Stato Iniziale/i)).toBeDefined()

    // Verify required mark and ARIA
    const nameInput = screen.getByLabelText(/Ragione Sociale \/ Nome Contatto/i)
    expect(nameInput.getAttribute('aria-required')).toBe('true')

    const emailInput = screen.getByLabelText(/^Email Aziendale/i)
    expect(emailInput.getAttribute('aria-required')).toBe('true')
  })

  it('populates select options dynamically from Seed definition', () => {
    render(<BeechForm seed={CLIENTI_SEED_SCHEMA} />)

    const tierSelect = screen.getByLabelText(/Piano Richiesto/i) as HTMLSelectElement
    expect(tierSelect.options.length).toBe(4) // placeholder + 3 options
    expect(tierSelect.options[1].value).toBe('free')
    expect(tierSelect.options[2].value).toBe('pro')
    expect(tierSelect.options[3].value).toBe('enterprise')
  })

  it('validates required fields before allowing submission', async () => {
    render(<BeechForm seed={CLIENTI_SEED_SCHEMA} />)

    const submitBtn = screen.getByRole('button', { name: /Invia richiesta/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      const errors = screen.getAllByText(/Questo campo è obbligatorio/i)
      expect(errors.length).toBeGreaterThan(0)
    })
  })

  it('executes end-to-end form submission with Time-Trap and Camouflage Honeypot', async () => {
    // Mock the backend endpoints
    const mockFetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/v1/public/timetrap/token')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            token: 't0_1740000000.abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234',
            minDeltaSeconds: 1.5,
          }),
        })
      }

      if (url.includes('/api/v1/public/clienti/add')) {
        const body = JSON.parse(init?.body as string)
        // Verify that submitted data matches expected payload
        expect(body.data.name).toBe('Acme Software S.r.l.')
        expect(body.data.email).toBe('contact@acmesoftware.it')
        expect(body.data.company).toBe('Acme SpA')
        expect(body.data.tier).toBe('pro')
        expect(body.data.account_status).toBe('active')
        expect(body._timeTrapToken).toBeDefined()

        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({
            data: {
              id: 'c9900000-0000-4000-8000-000000000099',
              slug: 'acme-software-s-r-l',
              status: 'published',
              name: 'Acme Software S.r.l.',
              email: 'c***@acmesoftware.it', // Masked confidential output
              company: 'Acme SpA',
              tier: 'pro',
              account_status: 'active',
            },
          }),
        })
      }

      return Promise.reject(new Error(`Unhandled URL: ${url}`))
    })

    globalThis.fetch = mockFetch

    const onSuccess = vi.fn()
    const onError = vi.fn()

    render(
      <BeechForm
        seed={CLIENTI_SEED_SCHEMA}
        baseUrl="http://localhost:8787"
        apiKey="dev-public-write-key-changeme"
        onSuccess={onSuccess}
        onError={onError}
      />
    )

    // Wait for time-trap token fetch
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/public/timetrap/token'),
        expect.anything()
      )
    })

    // Fast-forward Date.now to pass client time-trap delta (>= 1.5s)
    const realDateNow = Date.now
    const startTime = realDateNow()
    vi.spyOn(Date, 'now').mockImplementation(() => startTime + 2500)

    // Fill in the form fields
    fireEvent.change(screen.getByLabelText(/Ragione Sociale \/ Nome Contatto/i), {
      target: { value: 'Acme Software S.r.l.' },
    })
    fireEvent.change(screen.getByLabelText(/^Email Aziendale/i), {
      target: { value: 'contact@acmesoftware.it' },
    })
    fireEvent.change(screen.getByLabelText(/^Azienda$/i), {
      target: { value: 'Acme SpA' },
    })
    fireEvent.change(screen.getByLabelText(/Piano Richiesto/i), {
      target: { value: 'pro' },
    })
    fireEvent.change(screen.getByLabelText(/Stato Iniziale/i), {
      target: { value: 'active' },
    })

    // Submit form
    fireEvent.click(screen.getByRole('button', { name: /Invia richiesta/i }))

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled()
      expect(screen.getByText(/Messaggio inviato con successo/i)).toBeDefined()
    })

    expect(onError).not.toHaveBeenCalled()
  })
})
