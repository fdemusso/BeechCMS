// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import React, { useState } from 'react'
import { BeechForm, Honeypot, useBeechForm } from '../index.js'
import type { Locale } from '../types.js'

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
 * Headless example component demonstrating 1-line anti-bot with custom layout.
 */
function HeadlessCustomClientiForm({
  apiUrl,
  apiKey,
  locale,
  onSuccess,
  onError,
}: {
  apiUrl: string
  apiKey: string
  locale: Locale
  onSuccess?: (lead: Record<string, unknown>) => void
  onError?: (error: { status: number; message: string; details?: unknown }) => void
}) {
  const form = useBeechForm({
    seed: 'clienti',
    baseUrl: apiUrl,
    apiKey,
    locale,
    onSuccess: (res) => onSuccess?.(res.data),
    onError,
  })

  if (form.isSuccess) {
    return (
      <div style={{ padding: 16, background: '#f0fdf4', color: '#166534', borderRadius: 6 }}>
        Grazie! La richiesta è stata inviata con successo.
      </div>
    )
  }

  return (
    <form onSubmit={form.handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 1-line invisible anti-bot honeypot */}
      <Honeypot form={form} />

      {form.isLoadingSchema ? (
        <p style={{ color: '#6b7280', fontSize: 14 }}>Caricamento campi form dal CMS...</p>
      ) : (
        <>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Nome Azienda / Ragione Sociale *</label>
            <input
              {...form.register('name')}
              placeholder="es. Acme Corporation"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db' }}
            />
            {form.errors.name && <span style={{ color: '#dc2626', fontSize: 12 }}>{form.errors.name}</span>}
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Email Aziendale *</label>
            <input
              {...form.register('email')}
              type="email"
              placeholder="contatto@acme.com"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #d1d5db' }}
            />
            {form.errors.email && <span style={{ color: '#dc2626', fontSize: 12 }}>{form.errors.email}</span>}
          </div>

          <button
            type="submit"
            disabled={form.isSubmitting}
            style={{
              padding: '10px 16px',
              background: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: 6,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {form.isSubmitting ? 'Invio in corso...' : 'Invia con Headless Hook'}
          </button>
        </>
      )}
    </form>
  )
}

/**
 * Production-ready Lead Acquisition & Contact Form for the `clienti` Seed.
 * Showcases the zero-config Dynamic Schema Pattern and the Headless Hook pattern.
 */
export function ClientiTestPage({
  apiUrl = DEFAULT_API_URL,
  apiKey = DEFAULT_API_KEY,
  locale = 'it',
  onSuccess,
  onError,
}: ClientiTestPageProps) {
  const [activeTab, setActiveTab] = useState<'auto' | 'headless'>('auto')
  const [submittedData, setSubmittedData] = useState<Record<string, unknown> | null>(null)
  const [submissionStatus, setSubmissionStatus] = useState<string>('')

  const handleSuccess = (response: { id?: string; data: Record<string, unknown> } | Record<string, unknown>) => {
    const data: Record<string, unknown> =
      'data' in response && response.data ? (response.data as Record<string, unknown>) : (response as Record<string, unknown>)
    setSubmittedData(data)
    setSubmissionStatus('SUCCESS: Lead registrata correttamente nel database D1!')
    onSuccess?.(data)
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
          BeechCMS Form SDK — Zero-Config Dynamic Pattern
        </h1>
        <p style={{ color: '#4b5563', fontSize: 14, margin: 0, lineHeight: 1.5 }}>
          Schema caricato dinamicamente via <code>GET /api/v1/public/clienti/schema</code> con <strong>SWR Cache</strong>,
          difese anti-bot (Honeypot + Time-Trap HMAC) attive di default e crittografia AES-256 a riposo per i dati PII.
        </p>
      </header>

      {/* Pattern Selector Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => setActiveTab('auto')}
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            background: activeTab === 'auto' ? '#111827' : '#f3f4f6',
            color: activeTab === 'auto' ? '#ffffff' : '#374151',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Zero-Boilerplate (&lt;BeechForm seed=&quot;clienti&quot; /&gt;)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('headless')}
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            background: activeTab === 'headless' ? '#111827' : '#f3f4f6',
            color: activeTab === 'headless' ? '#ffffff' : '#374151',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Headless Hook (&lt;Honeypot form=&#123;form&#125; /&gt;)
        </button>
      </div>

      {/* Form Container */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          padding: 24,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }}
      >
        {activeTab === 'auto' ? (
          <BeechForm
            seed="clienti"
            baseUrl={apiUrl}
            apiKey={apiKey}
            locale={locale}
            onSuccess={handleSuccess}
            onError={handleError}
          />
        ) : (
          <HeadlessCustomClientiForm
            apiUrl={apiUrl}
            apiKey={apiKey}
            locale={locale}
            onSuccess={handleSuccess}
            onError={handleError}
          />
        )}
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
