// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import React, { useState } from 'react'
import { BeechForm } from '../components/BeechForm.js'
import type { Locale } from '../types.js'

/**
 * Environment configuration resolver supporting Vite, Next.js, and browser runtimes.
 *
 * In production, configure these variables in your .env file:
 * - Vite:     VITE_BEECH_API_URL and VITE_BEECH_PUBLIC_API_KEY
 * - Next.js:  NEXT_PUBLIC_BEECH_API_URL and NEXT_PUBLIC_BEECH_PUBLIC_API_KEY
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
  /**
   * The base URL of the BeechCMS API (e.g. "https://api.yourdomain.com").
   * Defaults to VITE_BEECH_API_URL / NEXT_PUBLIC_BEECH_API_URL or local dev worker.
   */
  apiUrl?: string

  /**
   * The public write API key for authentication.
   * Defaults to VITE_BEECH_PUBLIC_API_KEY / NEXT_PUBLIC_BEECH_PUBLIC_API_KEY.
   */
  apiKey?: string

  /**
   * UI and validation language ('it' | 'en').
   * @default 'it'
   */
  locale?: Locale

  /**
   * Optional callback fired when a lead submission is successfully persisted in D1.
   * @param lead - The created lead record returned by BeechCMS.
   */
  onSuccess?: (lead: Record<string, unknown>) => void

  /**
   * Optional callback fired when submission or schema fetch fails.
   * @param error - The structured error object.
   */
  onError?: (error: { status: number; message: string; details?: unknown }) => void
}

/**
 * Production-ready Lead Acquisition & Contact Form for the `clienti` Seed.
 *
 * Key Architecture Highlights:
 * 1. **Zero Schema Duplication**: Fetches the live field definitions, options, and rules directly
 *    from `GET /api/v1/public/schema` at runtime.
 * 2. **Multi-layer Anti-Bot Defense**:
 *    - Camouflage Honeypot decoy field (`fax_number`) rendered off-screen.
 *    - Cryptographic Time-Trap HMAC token automatically requested from `GET /api/v1/public/timetrap/token`
 *      to reject automated submissions with elapsed delta < 1.5 seconds.
 * 3. **Confidential PII Encryption**: Sensitive fields (such as Contact Email) are automatically encrypted
 *    at rest (AES-256-GCM) by the BeechCMS Botanical Engine.
 * 4. **Draft Recovery**: Inputs are persisted in real time to `localStorage` under `beech_form_draft_clienti`
 *    and cleared upon successful submission.
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
          BeechCMS Form Playground — Seed: <code>clienti</code>
        </h1>
        <p style={{ color: '#4b5563', fontSize: 14, margin: 0, lineHeight: 1.5 }}>
          Form generato <strong>automaticamente in tempo reale via API</strong> da{' '}
          <code>GET /api/v1/public/schema</code>. Nessuno schema dichiarato manualmente nel client!
        </p>
      </header>

      {/* Embedded BeechForm with zero-boilerplate dynamic schema fetch */}
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
          seed="clienti"
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
