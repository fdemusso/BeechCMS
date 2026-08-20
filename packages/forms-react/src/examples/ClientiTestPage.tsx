// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import React, { useState } from 'react'
import { BeechForm } from '../components/BeechForm.js'
import type { FormSeedSchema, Locale } from '../types.js'

/**
 * Production-Ready Seed Schema for Customer Registration & Lead Generation.
 *
 * 🏆 Architectural Best Practice:
 * Defining the form schema statically (or importing from your CMS seed definitions) provides:
 * 1. Zero Network Waterfall: The form renders immediately (SSR/SSG friendly, 0ms latency, zero CLS).
 * 2. Security & Privacy: No metadata leak of all CMS content types via client-side schema inspection.
 * 3. Editorial Precision: Expose exactly the required marketing fields (e.g. name, email, company, tier).
 * 4. Full Type-Safety: Static types for validation, IDE autocomplete, and submit payloads.
 */
export const CLIENTI_FORM_SCHEMA: FormSeedSchema = {
  slug: 'clienti',
  label: 'Richiesta di Contatto & Onboarding',
  branches: [
    {
      alias: 'name',
      label: 'Ragione Sociale / Nome Contatto',
      type: 'string',
      required: true,
      placeholder: 'es. Acme Corporation o Mario Rossi',
      helpText: 'Inserisci il nome della tua azienda o il tuo nominativo',
    },
    {
      alias: 'email',
      label: 'Email Aziendale',
      type: 'email',
      required: true,
      placeholder: 'nome@azienda.it',
      helpText: 'Dato riservato (Confidential PII): viene cifrato a riposo con AES-256-GCM',
    },
    {
      alias: 'company',
      label: 'Azienda',
      type: 'string',
      placeholder: 'es. Acme SpA',
    },
    {
      alias: 'tier',
      label: 'Piano di Interesse',
      type: 'select',
      required: true,
      placeholder: '-- Seleziona un Piano --',
      options: [
        { label: 'Piano Free (Fino a 3 utenti)', value: 'free' },
        { label: 'Piano Pro (€150/mese)', value: 'pro' },
        { label: 'Piano Enterprise (Personalizzato)', value: 'enterprise' },
      ],
    },
    {
      alias: 'account_status',
      label: 'Stato Iniziale Richiesta',
      type: 'select',
      required: true,
      options: [
        { label: 'Attivo / Pronto all\'onboarding', value: 'active' },
        { label: 'In valutazione / Richiesta informazioni', value: 'churned' },
      ],
    },
  ],
}

/**
 * Environment configuration resolver supporting Vite, Next.js, and browser runtimes.
 */
const DEFAULT_API_URL =
  (typeof import.meta !== 'undefined' && (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_BEECH_API_URL) ||
  (typeof process !== 'undefined' && (process as unknown as { env?: Record<string, string> }).env?.NEXT_PUBLIC_BEECH_API_URL) ||
  'http://localhost:8787'

const DEFAULT_API_KEY =
  (typeof import.meta !== 'undefined' && (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_BEECH_PUBLIC_API_KEY) ||
  (typeof process !== 'undefined' && (process as unknown as { env?: Record<string, string> }).env?.NEXT_PUBLIC_BEECH_PUBLIC_API_KEY) ||
  'dev-public-write-key-changeme'

/**
 * Properties for the {@link ClientiTestPage} component.
 */
export interface ClientiTestPageProps {
  /** Base URL of the BeechCMS API (e.g. "https://api.yourdomain.com"). */
  apiUrl?: string

  /** Public write API key. */
  apiKey?: string

  /** UI and validation language ('it' | 'en'). @default 'it' */
  locale?: Locale

  /** Optional callback fired when a lead submission is persisted in D1. */
  onSuccess?: (lead: Record<string, unknown>) => void

  /** Optional callback fired on submission error. */
  onError?: (error: { status: number; message: string; details?: unknown }) => void
}

/**
 * Production-ready Lead Acquisition & Contact Form for the `clienti` Seed.
 */
export function ClientiTestPage({
  apiUrl = DEFAULT_API_URL,
  apiKey = DEFAULT_API_KEY,
  locale = 'it',
  onSuccess,
  onError,
}: ClientiTestPageProps) {
  const [submittedData, setSubmittedData] = useState<Record<string, unknown> | null>(null)
  const [submissionStatus, setSubmissionStatus] = useState<string>('')

  const handleSuccess = (response: { id?: string; data: Record<string, unknown> }) => {
    setSubmittedData(response.data)
    setSubmissionStatus('SUCCESS: Lead registrata correttamente nel database D1!')
    onSuccess?.(response.data)
  }

  const handleError = (error: { status: number; message: string; details?: unknown }) => {
    setSubmissionStatus(`ERROR (${error.status}): ${error.message}`)
    onError?.(error)
  }

  return (
    <div
      className="clienti-test-page"
      style={{
        maxWidth: 640,
        margin: '40px auto',
        padding: '32px 24px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>
          BeechCMS Form Production Pattern — Seed: <code>clienti</code>
        </h1>
        <p style={{ color: '#4b5563', fontSize: 14, margin: 0, lineHeight: 1.5 }}>
          Form tipizzato e renderizzato <strong>immediatamente a zero-latenza</strong> (SSR/SSG ready) con difese anti-bot invisibili (Time-Trap HMAC + Honeypot mimetizzato).
        </p>
      </header>

      {/* Embedded BeechForm with statically typed schema */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          padding: 24,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}
      >
        <BeechForm
          seed={CLIENTI_FORM_SCHEMA}
          baseUrl={apiUrl}
          apiKey={apiKey}
          locale={locale}
          honeypotField="fax_number"
          onSuccess={handleSuccess}
          onError={handleError}
        />
      </div>

      {/* Real-Time Feedback Panel */}
      {submissionStatus && (
        <div
          style={{
            marginTop: 24,
            padding: 16,
            borderRadius: 6,
            background: submissionStatus.startsWith('SUCCESS') ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${submissionStatus.startsWith('SUCCESS') ? '#bbf7d0' : '#fecaca'}`,
            color: submissionStatus.startsWith('SUCCESS') ? '#166534' : '#991b1b',
          }}
          role="status"
        >
          <strong>{submissionStatus}</strong>
          {submittedData && (
            <pre
              style={{
                marginTop: 8,
                fontSize: 12,
                overflowX: 'auto',
                background: '#ffffff',
                padding: 12,
                borderRadius: 4,
                border: '1px solid #e5e7eb',
                color: '#1f2937',
              }}
            >
              {JSON.stringify(submittedData, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
