// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import React, { useState } from 'react'
import { BeechForm } from '../components/BeechForm.js'
import type { FormSeedSchema } from '../types.js'

/**
 * Seed definition for 'clienti' (Customer / Lead Acquisition Form)
 * Extracted directly from the local BeechCMS D1 database.
 */
export const CLIENTI_SEED_SCHEMA: FormSeedSchema = {
  slug: 'clienti',
  label: 'Customer Registration',
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
      label: 'Email Aziendale (Confidential PII)',
      type: 'email',
      required: true,
      placeholder: 'nome@azienda.it',
      helpText: 'Questo dato viene cifrato a riposo (AES-256-GCM) e protetto da policy',
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
        { label: 'Piano Pro (€150/mese)', value: 'pro' },
        { label: 'Piano Enterprise (€1200/mese)', value: 'enterprise' },
      ],
    },
    {
      alias: 'account_status',
      label: 'Stato Iniziale',
      type: 'select',
      required: true,
      options: [
        { label: 'Attivo / Pronto all\'onboarding', value: 'active' },
        { label: 'In valutazione', value: 'churned' },
      ],
    },
  ],
}

/**
 * Test Page Component wiring the 'clienti' BeechForm
 */
export function ClientiTestPage() {
  const [submittedData, setSubmittedData] = useState<Record<string, unknown> | null>(null)
  const [submissionStatus, setSubmissionStatus] = useState<string>('')

  return (
    <div className="clienti-test-page" style={{ maxWidth: 640, margin: '40px auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827' }}>
          BeechCMS Form Test — Seed: <code>clienti</code>
        </h1>
        <p style={{ color: '#4b5563', fontSize: 14 }}>
          Form generato automaticamente dal package <code>@beechcms/forms-react</code> a partire dalla definizione dello schema nel database D1.
        </p>
      </header>

      {/* Embedded BeechForm */}
      <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <BeechForm
          seed={CLIENTI_SEED_SCHEMA}
          baseUrl="http://localhost:8787"
          apiKey="dev-public-write-key-changeme"
          locale="it"
          honeypotField="fax_number"
          onSuccess={(response) => {
            setSubmittedData(response.data)
            setSubmissionStatus('SUCCESS: Lead registrata correttamente nel database D1!')
          }}
          onError={(error) => {
            setSubmissionStatus(`ERROR: ${error.message}`)
          }}
        />
      </div>

      {/* Feedback Panel */}
      {submissionStatus && (
        <div style={{ marginTop: 24, padding: 16, borderRadius: 6, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534' }}>
          <strong>{submissionStatus}</strong>
          {submittedData && (
            <pre style={{ marginTop: 8, fontSize: 12, overflowX: 'auto', background: '#ffffff', padding: 12, borderRadius: 4 }}>
              {JSON.stringify(submittedData, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
