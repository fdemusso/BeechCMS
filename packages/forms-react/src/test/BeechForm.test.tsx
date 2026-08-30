// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BeechForm } from '../components/BeechForm.js'
import type { FormSeedSchema } from '../types.js'

describe('BeechForm Component', () => {
  const testSchema: FormSeedSchema = {
    slug: 'contact-test',
    branches: [
      { alias: 'name', type: 'string', label: 'Nome Completo', required: true, placeholder: 'Inserisci il nome' },
      { alias: 'email', type: 'email', label: 'Indirizzo Email', required: true },
      { alias: 'message', type: 'text', label: 'Messaggio' },
      {
        alias: 'subject',
        type: 'select',
        label: 'Argomento',
        options: [
          { label: 'Supporto', value: 'support' },
          { label: 'Vendite', value: 'sales' },
        ],
      },
      { alias: 'privacy', type: 'boolean', placeholder: 'Accetto i termini' },
      {
        alias: 'orderNumber',
        type: 'string',
        label: 'Numero Ordine',
        dependsOn: { field: 'subject', op: 'eq', value: 'support' },
      },
    ],
  }

  beforeEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it('renders all schema fields and labels correctly with ARIA attributes', () => {
    render(<BeechForm seed={testSchema} />)

    expect(screen.getByLabelText(/Nome Completo/i)).toBeDefined()
    expect(screen.getByLabelText(/Indirizzo Email/i)).toBeDefined()
    expect(screen.getByLabelText(/Messaggio/i)).toBeDefined()
    expect(screen.getByLabelText(/Argomento/i)).toBeDefined()
    expect(screen.getByRole('button', { name: /Invia richiesta/i })).toBeDefined()

    // Required fields check
    const nameInput = screen.getByLabelText(/Nome Completo/i)
    expect(nameInput.getAttribute('aria-required')).toBe('true')
  })

  it('hides and shows conditional fields based on selection', () => {
    render(<BeechForm seed={testSchema} />)

    // Initially orderNumber should not be in document
    expect(screen.queryByLabelText(/Numero Ordine/i)).toBeNull()

    // Select "Supporto"
    const select = screen.getByLabelText(/Argomento/i)
    fireEvent.change(select, { target: { value: 'support' } })

    // Now orderNumber should appear
    expect(screen.getByLabelText(/Numero Ordine/i)).toBeDefined()

    // Change to "Vendite"
    fireEvent.change(select, { target: { value: 'sales' } })
    expect(screen.queryByLabelText(/Numero Ordine/i)).toBeNull()
  })

  it('supports English localization strings', () => {
    render(<BeechForm seed={testSchema} locale="en" />)

    expect(screen.getByRole('button', { name: /Submit Request/i })).toBeDefined()
  })

  it('renders custom children function when provided', () => {
    render(
      <BeechForm seed={testSchema}>
        {(form) => (
          <div>
            <span data-testid="custom-slug">{form.seedSlug}</span>
            <input data-testid="custom-input" {...form.register('name')} />
          </div>
        )}
      </BeechForm>
    )

    expect(screen.getByTestId('custom-slug').textContent).toBe('contact-test')
    expect(screen.getByTestId('custom-input')).toBeDefined()
  })

  it('displays success message on successful form submission', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: 'rec_abc' } }),
    })

    render(
      <BeechForm
        seed={testSchema}
        baseUrl="https://api.example.com"
        disableAntiBot={true}
      />
    )

    fireEvent.change(screen.getByLabelText(/Nome Completo/i), { target: { value: 'Mario' } })
    fireEvent.change(screen.getByLabelText(/Indirizzo Email/i), { target: { value: 'mario@test.com' } })

    fireEvent.click(screen.getByRole('button', { name: /Invia richiesta/i }))

    await waitFor(() => {
      expect(screen.getByText(/Messaggio inviato con successo/i)).toBeDefined()
    })
  })
})
