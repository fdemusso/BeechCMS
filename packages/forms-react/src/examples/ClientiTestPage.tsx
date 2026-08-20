// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import React, { useState } from 'react'
import { BeechForm } from '../components/BeechForm.js'

/**
 * Test Page Component wiring the 'clienti' BeechForm
 * Note: ZERO local schema declared! It dynamically fetches the schema from GET /api/v1/public/schema.
 */
export function ClientiTestPage() {
  const [submittedData, setSubmittedData] = useState<Record<string, unknown> | null>(null)
  const [submissionStatus, setSubmissionStatus] = useState<string>('')

  return (
    <div className="clienti-test-page" style={{ maxWidth: 640, margin: '40px auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111827' }}>
          BeechCMS Form Playground — Seed: <code>clienti</code>
        </h1>
        <p style={{ color: '#4b5563', fontSize: 14 }}>
          Form generato <strong>automaticamente in tempo reale via API</strong> da <code>GET /api/v1/public/schema</code>. Nessuno schema dichiarato manualmente nel client!
        </p>
      </header>

      {/* Embedded BeechForm with dynamic schema fetch */}
      <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <BeechForm
          seed="clienti"
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
