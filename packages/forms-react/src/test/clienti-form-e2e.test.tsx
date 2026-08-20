// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BeechForm } from '../components/BeechForm.js'
import type { FormSeedSchema } from '../types.js'

const CLIENTI_SEED_SCHEMA: FormSeedSchema = {
  slug: 'clienti',
  label: 'Customer Registration',
  branches: [
    {
      alias: 'name',
      label: 'Ragione Sociale / Nome Contatto',
      type: 'string',
      required: true,
      placeholder: 'es. Acme Corporation o Mario Rossi',
    },
    {
      alias: 'email',
      label: 'Email Aziendale',
      type: 'email',
      required: true,
      placeholder: 'nome@azienda.it',
    },
    {
      alias: 'company',
      label: 'Azienda',
      type: 'string',
      placeholder: 'es. Acme SpA',
    },
    {
      alias: 'tier',
      label: 'Piano Richiesto',
      type: 'select',
      required: true,
      placeholder: '-- Seleziona un Piano --',
      options: [
        { label: 'Piano Free', value: 'free' },
        { label: 'Piano Pro', value: 'pro' },
        { label: 'Piano Enterprise', value: 'enterprise' },
      ],
    },
    {
      alias: 'account_status',
      label: 'Stato Iniziale',
      type: 'select',
      required: true,
      options: [
        { label: 'Attivo', value: 'active' },
        { label: 'In valutazione', value: 'churned' },
      ],
    },
  ],
}

describe('Clienti Seed Form Integration E2E Test', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it('renders all schema-driven fields for the clienti Seed', () => {
    render(<BeechForm seed={CLIENTI_SEED_SCHEMA} />)

    // Verify fields derived from 'clienti' seed schema
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

  it('fetches scoped schema dynamically when seed is passed as a string with field filtering', async () => {
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/public/clienti/schema') || url.includes('/api/v1/public/schema')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            slug: 'clienti',
            label: 'Customer',
            branches: [
              { alias: 'name', type: 'text', label: 'Company / Contact Name', requiredOnCreate: true },
              { alias: 'email', type: 'text', label: 'Contact Email', requiredOnCreate: true },
              { alias: 'tier', type: 'text', label: 'Plan', requiredOnCreate: true, options: ['free', 'pro', 'enterprise'] },
              { alias: 'internal_audit', type: 'text', label: 'Internal Audit', requiredOnCreate: false },
            ],
          }),
        })
      }
      return Promise.resolve({ ok: true, json: async () => ({}) })
    })

    globalThis.fetch = mockFetch

    render(
      <BeechForm
        seed="clienti"
        baseUrl="http://localhost:8787"
        includeFields={['name', 'email']}
      />
    )

    // Dynamic schema fetch should render the filtered fields only
    await waitFor(() => {
      expect(screen.getByLabelText(/Company \/ Contact Name/i)).toBeDefined()
      expect(screen.getByLabelText(/Contact Email/i)).toBeDefined()
      expect(screen.queryByLabelText(/Plan/i)).toBeNull()
      expect(screen.queryByLabelText(/Internal Audit/i)).toBeNull()
    })
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
              email: 'c***@acmesoftware.it',
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
