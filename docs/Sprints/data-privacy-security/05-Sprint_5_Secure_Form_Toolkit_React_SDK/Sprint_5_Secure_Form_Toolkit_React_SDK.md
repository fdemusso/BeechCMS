### Pre-Computation Analysis

1. **God Nodes Identified:**
   - `publicAddHandler` (`apps/api/src/public/public-add.ts` L133): Entry point for public form ingestion (`POST /api/v1/public/:seed/add`), enforcing HoneyPot traps, Time Trap token validation, origin checks, Magic Bytes attachment inspection, and data classification privacy.
   - `publicRoutes` (`apps/api/src/public/public-routes.ts` L95): Public router exposing `GET /timetrap/token` and `POST /:seed/add`.
   - `generateTimeTrapToken` / `verifyTimeTrapToken` (`packages/core/src/security/time-trap.ts` L14): Core HMAC SHA-256 token generation and verification primitives.
   - `verifyMagicBytes` (`packages/core/src/media/magic-bytes.ts` L10): Synchronous binary header verification for image and document uploads.
   - `createBeechClient` (`packages/client/src/client.ts` L22): Client-side API caller for BeechCMS public endpoints.

2. **Architectural Boundaries Affected:**
   - `packages/forms-react` (New Package):
     - `packages/forms-react/package.json`: Manifest declaring `@beechcms/forms-react` package, exporting ESM + TypeScript declarations, peer-depending on `react` and `react-dom`.
     - `packages/forms-react/tsconfig.json`: Strict TypeScript compiler configuration with `"jsx": "react-jsx"`.
     - `packages/forms-react/vitest.config.ts`: Vitest configuration using `jsdom` environment.
     - `packages/forms-react/src/types.ts`: Comprehensive schema, field configuration, anti-bot state, draft recovery, and component prop definitions.
     - `packages/forms-react/src/core/honeypot.ts`: Decoy field definitions (`fax_number`, `website_url`, etc.) and invisible styling helpers.
     - `packages/forms-react/src/core/time-trap.ts`: Client time-trap token retriever and timestamp tracker.
     - `packages/forms-react/src/core/draft-storage.ts`: Resilient `localStorage` persistence engine (`beech_form_draft_<seed>`).
     - `packages/forms-react/src/core/conditional-logic.ts`: Pure evaluator for field visibility rules (`dependsOn`).
     - `packages/forms-react/src/core/file-uploader.ts`: Client-side synchronous Magic Bytes inspector (< 5ms) and base64 encoder.
     - `packages/forms-react/src/i18n/translations.ts`: Built-in Italian (default) and English translations.
     - `packages/forms-react/src/hooks/useBeechForm.ts`: Headless hook managing state, anti-bot token acquisition, draft persistence, field registration, validation, and submission.
     - `packages/forms-react/src/components/HoneypotField.tsx`: Invisible decoy input component.
     - `packages/forms-react/src/components/FormField.tsx`: Accessible WAI-ARIA form control renderer for all supported branch types.
     - `packages/forms-react/src/components/BeechForm.tsx`: Schema-driven, accessible React form container.
     - `packages/forms-react/src/index.ts`: Public package API re-exports.
     - `packages/forms-react/src/test/`: Comprehensive unit and React component test suite.
   - `@beechcms/core`: Unaffected (core contracts already established in Sprints 1–4).
   - `apps/api`: Unaffected (public endpoints `GET /timetrap/token` and `POST /:seed/add` already operational).
   - `apps/dashboard`: Unaffected (isolated administrative interface).

3. **Graphify Impact Analysis (`graphify affected`):**
   - Affected nodes for `packages_client_src_client_createbeechclient`:
     - `packages/client/src/index.ts`
     - `packages/client/src/client.test.ts`
   - Affected nodes for `packages_core_src_security_time_trap_generatetimetraptoken`:
     - `packages/core/src/index.ts`
     - `packages/core/src/security/time-trap.test.ts`
     - `apps/api/src/public/public-routes.ts`
   - Affected nodes for `packages_core_src_media_magic_bytes_verifymagicbytes`:
     - `packages/core/src/index.ts`
     - `packages/core/src/media/magic-bytes.test.ts`
     - `apps/api/src/public/public-add.ts`
   - Summary: The addition of `packages/forms-react` introduces zero breaking changes to existing core contracts, API routes, or dashboard slices.

---

### VETO Audit

- **Botanical Dialect Compliance:** Confirmed. `<BeechForm />` and `useBeechForm` interact strictly with the Public API (`POST /api/v1/public/:seed/add`), submitting semantic branch alias key-value payloads. No direct database interactions or raw SQL bypasses exist in the client SDK.
- **Vertical Slice Architecture (VSA):** Confirmed. `@beechcms/forms-react` is an independent client-side package under `packages/forms-react/` consuming public HTTP contracts. It has zero cross-imports with `apps/api/features/` or `apps/dashboard/src/features/`.
- **Cloudflare & Browser Purity:** Confirmed. The package is completely browser-compatible (React 19/18, standard `fetch`, Web Crypto / localStorage), with zero Node.js native binary dependencies.
- **YAGNI Compliance:** Confirmed. The package focuses strictly on schema-driven form rendering, camouflage honeypot, time-trap token acquisition, draft recovery, conditional fields, and bilingual i18n, without superfluous external styling frameworks or heavyweight state management libraries.

---

# Sprint Output Template (Strictly Enforced)

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================
This sprint delivers the client-facing `@beechcms/forms-react` package, completing the 2-tier Secure Forms & Data Privacy architecture outlined in the Feature Brief.

With the backend security foundations (Sprints 1–4) in place—including Edge crypto, privacy classification, context-aware filtering, Honeypot traps, HMAC Time Trap verification, and VirusTotal quarantine pipelines—frontend developers need a zero-boilerplate, accessible React SDK to embed secure contact and lead capture forms into websites within minutes.

This sprint adheres to BeechCMS invariants:
1. **Zero Human Friction Anti-Bot**: The SDK seamlessly coordinates the 5-level anti-bot defense (Camouflage Honeypot injection and Time Trap token retrieval) completely invisibly to human users, requiring zero intrusive CAPTCHA puzzles.
2. **Micro-DX & User Experience**: Automatic real-time draft recovery via `localStorage` prevents data loss on accidental reloads, while dynamic `dependsOn` conditional rules enable responsive, schema-driven form flows.
3. **Accessibility (WAI-ARIA) & i18n**: Every generated form control includes native labels, descriptive IDs, `aria-required`, `aria-invalid`, and error association (`aria-describedby`), with built-in Italian and English localization.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================
- **God Nodes Identified:**
  - `publicRoutes` (`apps/api/src/public/public-routes.ts`): Exposes `GET /api/v1/public/timetrap/token` and `POST /api/v1/public/:seed/add`.
  - `publicAddHandler` (`apps/api/src/public/public-add.ts`): Accepts JSON submissions with payload `{ data: Record<string, unknown>, _timeTrapToken?: string, attachments?: Array<{ filename: string, mimeType: string, data: string }> }`.
  - `verifyMagicBytes` (`packages/core/src/media/magic-bytes.ts`): Validates file buffer signatures against declared MIME types (PDF, PNG, JPEG, GIF, WebP).
  - `createBeechClient` (`packages/client/src/client.ts`): Provides raw API client operations.
- **Monorepo Package Ecosystem:**
  - `packages/core`: Core domain logic and engine types.
  - `packages/client`: Lightweight TypeScript SDK for public API.
  - `packages/widget-sdk`: Modular dashboard widget SDK using React + Tailwind.
  - `packages/forms-react`: Does not yet exist; will be introduced in this sprint.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================
- `packages/forms-react/package.json`: Package manifest configured for pnpm workspace.
- `packages/forms-react/tsconfig.json`: TypeScript compiler options with JSX support.
- `packages/forms-react/vitest.config.ts`: Vitest runner configuration with `jsdom`.
- `packages/forms-react/src/types.ts`: TypeScript contracts for schema, rules, anti-bot state, drafts, translations, and component props.
- `packages/forms-react/src/core/honeypot.ts`: Honeypot decoy generator and style constants.
- `packages/forms-react/src/core/time-trap.ts`: Time-trap token fetching and delta tracking utility.
- `packages/forms-react/src/core/draft-storage.ts`: Local draft recovery store with resilient JSON serialization.
- `packages/forms-react/src/core/conditional-logic.ts`: Deterministic conditional visibility evaluator (`dependsOn`).
- `packages/forms-react/src/core/file-uploader.ts`: Client-side magic bytes validator and file-to-base64 converter.
- `packages/forms-react/src/i18n/translations.ts`: Default Italian (`it`) and English (`en`) translation dictionaries.
- `packages/forms-react/src/hooks/useBeechForm.ts`: Main React hook for headless form control and submission orchestration.
- `packages/forms-react/src/components/HoneypotField.tsx`: Accessible, hidden honeypot component.
- `packages/forms-react/src/components/FormField.tsx`: Schema-driven accessible input field renderer (text, email, textarea, number, select, checkbox, radio, file).
- `packages/forms-react/src/components/BeechForm.tsx`: Primary `<BeechForm />` component.
- `packages/forms-react/src/index.ts`: Entry point re-exporting all public APIs.
- Unit and Component Test Suites:
  - `packages/forms-react/src/test/draft-storage.test.ts`
  - `packages/forms-react/src/test/conditional-logic.test.ts`
  - `packages/forms-react/src/test/time-trap.test.ts`
  - `packages/forms-react/src/test/file-uploader.test.ts`
  - `packages/forms-react/src/test/useBeechForm.test.ts`
  - `packages/forms-react/src/test/BeechForm.test.tsx`

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### 1. Package Configuration (`packages/forms-react/package.json`, `tsconfig.json`, `vitest.config.ts`)

#### `packages/forms-react/package.json`
```json
{
  "name": "@beechcms/forms-react",
  "version": "0.7.0",
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": [
    "dist"
  ],
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc -w --preserveWatchOutput",
    "lint": "eslint .",
    "type-check": "tsc --noEmit",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage"
  },
  "peerDependencies": {
    "react": "^18.0.0 || ^19.0.0",
    "react-dom": "^18.0.0 || ^19.0.0"
  },
  "dependencies": {
    "@beechcms/client": "workspace:^0.6.0-preview.3"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.3.0",
    "@types/node": "^24.10.1",
    "@types/react": "^19.2.7",
    "@types/react-dom": "^19.2.7",
    "@vitest/coverage-v8": "^4.1.0",
    "jsdom": "^25.0.1",
    "react": "^19.2.7",
    "react-dom": "^19.2.7",
    "typescript": "^5.9.3",
    "vitest": "^4.1.0"
  },
  "license": "MIT"
}
```

#### `packages/forms-react/tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts", "**/*.test.tsx"]
}
```

#### `packages/forms-react/vitest.config.ts`
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/index.ts', 'src/types.ts'],
    },
  },
})
```

---

### 2. TypeScript Contracts (`packages/forms-react/src/types.ts`)

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { ReactNode } from 'react'

export type FormBranchType =
  | 'string'
  | 'text'
  | 'number'
  | 'boolean'
  | 'select'
  | 'date'
  | 'file'
  | 'email'

export type ConditionalOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'not_in'
  | 'is_empty'
  | 'is_not_empty'
  | 'contains'

export interface ConditionalRule {
  field: string
  op: ConditionalOperator
  value?: unknown
}

export interface FormBranchSchema {
  alias: string
  type: FormBranchType
  label?: string
  placeholder?: string
  required?: boolean
  options?: Array<{ label: string; value: string | number }>
  defaultValue?: unknown
  dependsOn?: ConditionalRule | ConditionalRule[]
  accept?: string
  maxSizeMb?: number
  helpText?: string
}

export interface FormSeedSchema {
  slug: string
  label?: string
  branches: FormBranchSchema[]
}

export interface FormFileAttachment {
  filename: string
  mimeType: string
  data: string // base64 encoded content
}

export interface FormTranslations {
  submitButton: string
  submittingButton: string
  successTitle: string
  successMessage: string
  errorTitle: string
  genericErrorMessage: string
  requiredField: string
  invalidEmail: string
  invalidNumber: string
  invalidFileType: string
  fileTooLarge: (maxMb: number) => string
  draftRestored: string
  timeTrapWarning: string
  honeypotLabel: string
}

export type Locale = 'it' | 'en'

export interface UseBeechFormOptions<TValues extends Record<string, unknown> = Record<string, unknown>> {
  seed: string | FormSeedSchema
  baseUrl?: string
  apiKey?: string
  locale?: Locale
  translations?: Partial<FormTranslations>
  initialValues?: Partial<TValues>
  disableDraft?: boolean
  disableAntiBot?: boolean
  honeypotField?: string
  onSuccess?: (result: { id?: string; data: TValues }) => void
  onError?: (error: { status: number; message: string; details?: unknown }) => void
}

export interface FormFieldState {
  value: unknown
  error?: string
  touched: boolean
  visible: boolean
}

export interface UseBeechFormReturn<TValues extends Record<string, unknown> = Record<string, unknown>> {
  seedSlug: string
  values: TValues
  errors: Partial<Record<keyof TValues | string, string>>
  touched: Partial<Record<keyof TValues | string, boolean>>
  isSubmitting: boolean
  isSuccess: boolean
  isDraftRestored: boolean
  serverError: string | null
  timeTrapReady: boolean
  honeypotName: string
  honeypotValue: string
  translations: FormTranslations
  setFieldValue: (field: string, value: unknown) => void
  setFieldTouched: (field: string, isTouched?: boolean) => void
  setFieldError: (field: string, error?: string) => void
  setHoneypotValue: (value: string) => void
  isFieldVisible: (field: string) => boolean
  register: (field: string) => {
    name: string
    value: unknown
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void
    onBlur: () => void
    'aria-invalid'?: boolean
    'aria-required'?: boolean
    'aria-describedby'?: string
  }
  handleFileChange: (field: string, file: File | null) => Promise<void>
  handleSubmit: (e?: React.FormEvent<HTMLFormElement>) => Promise<boolean>
  reset: () => void
  clearDraft: () => void
}

export interface BeechFormProps<TValues extends Record<string, unknown> = Record<string, unknown>>
  extends UseBeechFormOptions<TValues> {
  className?: string
  children?: ReactNode | ((form: UseBeechFormReturn<TValues>) => ReactNode)
}
```

---

### 3. Core Modules

#### `packages/forms-react/src/core/honeypot.ts`
```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export const DEFAULT_HONEYPOT_NAME = 'fax_number'
export const HONEYPOT_DECOYS = ['fax_number', 'website_url', 'middle_name', 'secondary_phone', '_gotcha', 'honeypot'] as const

export const HONEYPOT_CONTAINER_STYLE: React.CSSProperties = {
  position: 'absolute',
  left: '-9999px',
  top: '-9999px',
  width: '1px',
  height: '1px',
  opacity: 0,
  overflow: 'hidden',
  pointerEvents: 'none',
}
```

#### `packages/forms-react/src/core/time-trap.ts`
```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export interface TimeTrapTokenResponse {
  token: string
  minDeltaSeconds?: number
}

export async function fetchTimeTrapToken(
  baseUrl: string,
  customFetch?: typeof fetch
): Promise<{ token: string; timestamp: number } | null> {
  const doFetch = customFetch ?? fetch
  const cleanBase = baseUrl.replace(/\/+$/, '')
  const endpoint = `${cleanBase}/api/v1/public/timetrap/token`

  try {
    const res = await doFetch(endpoint, { method: 'GET' })
    if (!res.ok) return null
    const json = (await res.json()) as TimeTrapTokenResponse
    return {
      token: json.token,
      timestamp: Date.now(),
    }
  } catch {
    return null
  }
}
```

#### `packages/forms-react/src/core/draft-storage.ts`
```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export function getDraftStorageKey(seedSlug: string): string {
  return `beech_form_draft_${seedSlug}`
}

export function saveFormDraft(seedSlug: string, values: Record<string, unknown>): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false
  try {
    const key = getDraftStorageKey(seedSlug)
    // Exclude file blobs and anti-bot internal properties from persistence
    const sanitized: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(values)) {
      if (k.startsWith('_') || k.startsWith('fax_number') || v instanceof File || (v && typeof v === 'object' && 'data' in v && 'mimeType' in v)) {
        continue
      }
      sanitized[k] = v
    }
    window.localStorage.setItem(key, JSON.stringify(sanitized))
    return true
  } catch {
    return false
  }
}

export function loadFormDraft<TValues extends Record<string, unknown>>(seedSlug: string): Partial<TValues> | null {
  if (typeof window === 'undefined' || !window.localStorage) return null
  try {
    const key = getDraftStorageKey(seedSlug)
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as Partial<TValues>
  } catch {
    return null
  }
}

export function clearFormDraft(seedSlug: string): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false
  try {
    window.localStorage.removeItem(getDraftStorageKey(seedSlug))
    return true
  } catch {
    return false
  }
}
```

#### `packages/forms-react/src/core/conditional-logic.ts`
```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { ConditionalRule } from '../types.js'

export function evaluateSingleCondition(rule: ConditionalRule, formValues: Record<string, unknown>): boolean {
  const currentVal = formValues[rule.field]
  const targetVal = rule.value

  switch (rule.op) {
    case 'eq':
      return currentVal === targetVal
    case 'neq':
      return currentVal !== targetVal
    case 'gt':
      return typeof currentVal === 'number' && typeof targetVal === 'number' && currentVal > targetVal
    case 'gte':
      return typeof currentVal === 'number' && typeof targetVal === 'number' && currentVal >= targetVal
    case 'lt':
      return typeof currentVal === 'number' && typeof targetVal === 'number' && currentVal < targetVal
    case 'lte':
      return typeof currentVal === 'number' && typeof targetVal === 'number' && currentVal <= targetVal
    case 'in':
      return Array.isArray(targetVal) && targetVal.includes(currentVal)
    case 'not_in':
      return Array.isArray(targetVal) && !targetVal.includes(currentVal)
    case 'is_empty':
      return currentVal === undefined || currentVal === null || currentVal === '' || (Array.isArray(currentVal) && currentVal.length === 0)
    case 'is_not_empty':
      return currentVal !== undefined && currentVal !== null && currentVal !== '' && (!Array.isArray(currentVal) || currentVal.length > 0)
    case 'contains':
      if (typeof currentVal === 'string' && typeof targetVal === 'string') {
        return currentVal.includes(targetVal)
      }
      if (Array.isArray(currentVal)) {
        return currentVal.includes(targetVal)
      }
      return false
    default:
      return true
  }
}

export function evaluateCondition(
  condition: ConditionalRule | ConditionalRule[] | undefined,
  formValues: Record<string, unknown>
): boolean {
  if (!condition) return true
  if (Array.isArray(condition)) {
    return condition.every((rule) => evaluateSingleCondition(rule, formValues))
  }
  return evaluateSingleCondition(condition, formValues)
}
```

#### `packages/forms-react/src/core/file-uploader.ts`
```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { FormFileAttachment } from '../types.js'

export interface ClientMagicBytesResult {
  valid: boolean
  error?: string
}

export function verifyClientMagicBytes(bytes: Uint8Array, declaredMime: string): ClientMagicBytesResult {
  if (bytes.length < 4) {
    return { valid: false, error: 'File buffer too small for signature inspection' }
  }

  const normalized = declaredMime.split(';')[0].trim().toLowerCase()

  // PDF: %PDF-
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return normalized === 'application/pdf'
      ? { valid: true }
      : { valid: false, error: `Invalid file signature: expected PDF for ${declaredMime}` }
  }

  // PNG
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    return normalized === 'image/png'
      ? { valid: true }
      : { valid: false, error: `Invalid file signature: expected PNG for ${declaredMime}` }
  }

  // JPEG
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    return normalized === 'image/jpeg' || normalized === 'image/jpg'
      ? { valid: true }
      : { valid: false, error: `Invalid file signature: expected JPEG for ${declaredMime}` }
  }

  // GIF
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return normalized === 'image/gif'
      ? { valid: true }
      : { valid: false, error: `Invalid file signature: expected GIF for ${declaredMime}` }
  }

  // WebP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return normalized === 'image/webp'
      ? { valid: true }
      : { valid: false, error: `Invalid file signature: expected WebP for ${declaredMime}` }
  }

  // Fallback for non-binary formats like plaintext/csv
  if (normalized === 'text/plain' || normalized === 'text/csv') {
    return { valid: true }
  }

  return { valid: false, error: `Unsupported or invalid file signature for ${declaredMime}` }
}

export async function fileToAttachment(file: File): Promise<{ attachment: FormFileAttachment; error?: string }> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const validation = verifyClientMagicBytes(bytes, file.type || 'application/octet-stream')
  if (!validation.valid) {
    return {
      attachment: { filename: file.name, mimeType: file.type, data: '' },
      error: validation.error,
    }
  }

  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  const base64 = btoa(binary)

  return {
    attachment: {
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      data: base64,
    },
  }
}
```

---

### 4. Localization (`packages/forms-react/src/i18n/translations.ts`)

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { FormTranslations, Locale } from '../types.js'

export const translationsIT: FormTranslations = {
  submitButton: 'Invia richiesta',
  submittingButton: 'Invio in corso...',
  successTitle: 'Messaggio inviato con successo',
  successMessage: 'Grazie per averci contattato. Ti risponderemo al più presto.',
  errorTitle: 'Errore durante l\'invio',
  genericErrorMessage: 'Si è verificato un errore durante l\'invio del form. Riprova più tardi.',
  requiredField: 'Questo campo è obbligatorio',
  invalidEmail: 'Inserisci un indirizzo email valido',
  invalidNumber: 'Inserisci un valore numerico valido',
  invalidFileType: 'Formato file non valido o firma non corrispondente',
  fileTooLarge: (maxMb) => `La dimensione del file supera il limite massimo di ${maxMb}MB`,
  draftRestored: 'Bozza precedente ripristinata automaticamente',
  timeTrapWarning: 'Compilazione troppo rapida. Attendi un secondo prima di inviare.',
  honeypotLabel: 'Non compilare questo campo',
}

export const translationsEN: FormTranslations = {
  submitButton: 'Submit Request',
  submittingButton: 'Submitting...',
  successTitle: 'Message sent successfully',
  successMessage: 'Thank you for reaching out. We will get back to you soon.',
  errorTitle: 'Submission Error',
  genericErrorMessage: 'An error occurred while submitting the form. Please try again.',
  requiredField: 'This field is required',
  invalidEmail: 'Please enter a valid email address',
  invalidNumber: 'Please enter a valid number',
  invalidFileType: 'Invalid file type or mismatched signature',
  fileTooLarge: (maxMb) => `File size exceeds the maximum limit of ${maxMb}MB`,
  draftRestored: 'Previous draft restored automatically',
  timeTrapWarning: 'Submission too fast. Please wait a second before submitting.',
  honeypotLabel: 'Do not fill this field',
}

export function getTranslations(locale: Locale = 'it', custom?: Partial<FormTranslations>): FormTranslations {
  const base = locale === 'en' ? translationsEN : translationsIT
  return { ...base, ...custom }
}
```

---

### 5. Headless Hook (`packages/forms-react/src/hooks/useBeechForm.ts`)

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormSeedSchema, FormTranslations, UseBeechFormOptions, UseBeechFormReturn } from '../types.js'
import { DEFAULT_HONEYPOT_NAME } from '../core/honeypot.js'
import { fetchTimeTrapToken } from '../core/time-trap.js'
import { clearFormDraft, loadFormDraft, saveFormDraft } from '../core/draft-storage.js'
import { evaluateCondition } from '../core/conditional-logic.js'
import { fileToAttachment } from '../core/file-uploader.js'
import { getTranslations } from '../i18n/translations.js'

export function useBeechForm<TValues extends Record<string, unknown> = Record<string, unknown>>(
  options: UseBeechFormOptions<TValues>
): UseBeechFormReturn<TValues> {
  const {
    seed,
    baseUrl = '',
    apiKey = '',
    locale = 'it',
    translations: customTranslations,
    initialValues = {},
    disableDraft = false,
    disableAntiBot = false,
    honeypotField = DEFAULT_HONEYPOT_NAME,
    onSuccess,
    onError,
  } = options

  const seedSlug = typeof seed === 'string' ? seed : seed.slug
  const schema: FormSeedSchema | null = typeof seed === 'object' ? seed : null
  const translations = useMemo(() => getTranslations(locale, customTranslations), [locale, customTranslations])

  const [values, setValues] = useState<TValues>(() => {
    const base = { ...initialValues } as TValues
    if (!disableDraft) {
      const saved = loadFormDraft<TValues>(seedSlug)
      if (saved) return { ...base, ...saved }
    }
    return base
  })

  const [errors, setErrors] = useState<Partial<Record<keyof TValues | string, string>>>({})
  const [touched, setTouched] = useState<Partial<Record<keyof TValues | string, boolean>>>({})
  const [attachments, setAttachments] = useState<Record<string, { filename: string; mimeType: string; data: string }>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [isDraftRestored, setIsDraftRestored] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  // Anti-Bot: Honeypot State
  const [honeypotValue, setHoneypotValue] = useState('')

  // Anti-Bot: Time Trap State
  const [timeTrapToken, setTimeTrapToken] = useState<string | null>(null)
  const mountTimeRef = useRef<number>(Date.now())

  // Initial mount: load draft indicator & fetch time-trap token
  useEffect(() => {
    mountTimeRef.current = Date.now()
    if (!disableDraft) {
      const saved = loadFormDraft<TValues>(seedSlug)
      if (saved && Object.keys(saved).length > 0) {
        setIsDraftRestored(true)
      }
    }

    if (!disableAntiBot && baseUrl) {
      fetchTimeTrapToken(baseUrl).then((res) => {
        if (res) {
          setTimeTrapToken(res.token)
          mountTimeRef.current = res.timestamp
        }
      })
    }
  }, [seedSlug, baseUrl, disableDraft, disableAntiBot])

  // Real-time auto-save draft
  useEffect(() => {
    if (!disableDraft && !isSuccess) {
      saveFormDraft(seedSlug, values)
    }
  }, [seedSlug, values, disableDraft, isSuccess])

  const setFieldValue = useCallback((field: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[field]
      return next
    })
  }, [])

  const setFieldTouched = useCallback((field: string, isTouched = true) => {
    setTouched((prev) => ({ ...prev, [field]: isTouched }))
  }, [])

  const setFieldError = useCallback((field: string, error?: string) => {
    setErrors((prev) => {
      const next = { ...prev }
      if (error) next[field] = error
      else delete next[field]
      return next
    })
  }, [])

  const isFieldVisible = useCallback(
    (field: string): boolean => {
      if (!schema) return true
      const branch = schema.branches.find((b) => b.alias === field)
      if (!branch || !branch.dependsOn) return true
      return evaluateCondition(branch.dependsOn, values)
    },
    [schema, values]
  )

  const register = useCallback(
    (field: string) => {
      const isVisible = isFieldVisible(field)
      const fieldError = errors[field]
      const isFieldTouched = touched[field]
      const branch = schema?.branches.find((b) => b.alias === field)
      const isRequired = branch?.required ?? false

      return {
        name: field,
        value: (values[field] ?? '') as string | number | readonly string[] | undefined,
        onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
          const val = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value
          setFieldValue(field, val)
        },
        onBlur: () => setFieldTouched(field, true),
        'aria-invalid': !!(isFieldTouched && fieldError),
        'aria-required': isRequired,
        'aria-describedby': fieldError ? `${field}-error` : undefined,
      }
    },
    [isFieldVisible, errors, touched, schema, values, setFieldValue, setFieldTouched]
  )

  const handleFileChange = useCallback(
    async (field: string, file: File | null) => {
      if (!file) {
        setFieldValue(field, null)
        setAttachments((prev) => {
          const next = { ...prev }
          delete next[field]
          return next
        })
        return
      }

      const branch = schema?.branches.find((b) => b.alias === field)
      if (branch?.maxSizeMb && file.size > branch.maxSizeMb * 1024 * 1024) {
        setFieldError(field, translations.fileTooLarge(branch.maxSizeMb))
        return
      }

      const { attachment, error } = await fileToAttachment(file)
      if (error) {
        setFieldError(field, translations.invalidFileType)
        return
      }

      setAttachments((prev) => ({ ...prev, [field]: attachment }))
      setFieldValue(field, file.name)
    },
    [schema, translations, setFieldValue, setFieldError]
  )

  const validate = useCallback((): boolean => {
    const nextErrors: Partial<Record<string, string>> = {}
    if (schema) {
      for (const branch of schema.branches) {
        if (!isFieldVisible(branch.alias)) continue
        const val = values[branch.alias]
        if (branch.required) {
          if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) {
            nextErrors[branch.alias] = translations.requiredField
          }
        }
        if (branch.type === 'email' && typeof val === 'string' && val.trim() !== '') {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
          if (!emailRegex.test(val)) {
            nextErrors[branch.alias] = translations.invalidEmail
          }
        }
        if (branch.type === 'number' && val !== undefined && val !== null && val !== '') {
          if (isNaN(Number(val))) {
            nextErrors[branch.alias] = translations.invalidNumber
          }
        }
      }
    }
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }, [schema, isFieldVisible, values, translations])

  const handleSubmit = useCallback(
    async (e?: React.FormEvent<HTMLFormElement>): Promise<boolean> => {
      if (e) e.preventDefault()
      setServerError(null)

      if (!validate()) {
        return false
      }

      // Check Honeypot Trap
      if (honeypotValue.trim() !== '') {
        setServerError(translations.genericErrorMessage)
        onError?.({ status: 422, message: 'Bot submission rejected' })
        return false
      }

      // Check Time Trap Delta on client (< 1.5s)
      const elapsedSeconds = (Date.now() - mountTimeRef.current) / 1000
      if (!disableAntiBot && elapsedSeconds < 1.5) {
        setServerError(translations.timeTrapWarning)
        onError?.({ status: 422, message: 'Time trap delta violation' })
        return false
      }

      setIsSubmitting(true)

      try {
        // Construct sanitized public payload: filter out hidden conditional fields
        const payloadData: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(values)) {
          if (isFieldVisible(k)) {
            payloadData[k] = v
          }
        }

        const requestBody: Record<string, unknown> = {
          data: payloadData,
        }

        if (timeTrapToken) {
          requestBody._timeTrapToken = timeTrapToken
        }

        const attachmentList = Object.values(attachments)
        if (attachmentList.length > 0) {
          requestBody.attachments = attachmentList
        }

        const cleanBase = baseUrl.replace(/\/+$/, '')
        const endpoint = `${cleanBase}/api/v1/public/${encodeURIComponent(seedSlug)}/add`

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { 'X-API-Key': apiKey } : {}),
            ...(timeTrapToken ? { 'x-time-trap': timeTrapToken } : {}),
          },
          body: JSON.stringify(requestBody),
        })

        const json = await response.json().catch(() => null)

        if (!response.ok) {
          const detail = json?.detail || json?.title || translations.genericErrorMessage
          setServerError(detail)
          onError?.({ status: response.status, message: detail, details: json })
          return false
        }

        setIsSuccess(true)
        clearFormDraft(seedSlug)
        onSuccess?.({ id: json?.data?.id, data: values })
        return true
      } catch (err) {
        const msg = err instanceof Error ? err.message : translations.genericErrorMessage
        setServerError(msg)
        onError?.({ status: 0, message: msg, details: err })
        return false
      } finally {
        setIsSubmitting(false)
      }
    },
    [
      validate,
      honeypotValue,
      translations,
      disableAntiBot,
      values,
      isFieldVisible,
      timeTrapToken,
      attachments,
      baseUrl,
      seedSlug,
      apiKey,
      onSuccess,
      onError,
    ]
  )

  const reset = useCallback(() => {
    setValues({ ...initialValues } as TValues)
    setErrors({})
    setTouched({})
    setAttachments({})
    setServerError(null)
    setIsSuccess(false)
    setHoneypotValue('')
    clearFormDraft(seedSlug)
  }, [initialValues, seedSlug])

  const clearDraft = useCallback(() => {
    clearFormDraft(seedSlug)
    setIsDraftRestored(false)
  }, [seedSlug])

  return {
    seedSlug,
    values,
    errors,
    touched,
    isSubmitting,
    isSuccess,
    isDraftRestored,
    serverError,
    timeTrapReady: !!timeTrapToken,
    honeypotName: honeypotField,
    honeypotValue,
    translations,
    setFieldValue,
    setFieldTouched,
    setFieldError,
    setHoneypotValue,
    isFieldVisible,
    register,
    handleFileChange,
    handleSubmit,
    reset,
    clearDraft,
  }
}
```

---

### 6. Components (`HoneypotField.tsx`, `FormField.tsx`, `BeechForm.tsx`)

#### `packages/forms-react/src/components/HoneypotField.tsx`
```tsx
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { FC } from 'react'
import { HONEYPOT_CONTAINER_STYLE } from '../core/honeypot.js'

export interface HoneypotFieldProps {
  name: string
  value: string
  onChange: (value: string) => void
  label?: string
}

export const HoneypotField: FC<HoneypotFieldProps> = ({
  name,
  value,
  onChange,
  label = 'Do not fill this field',
}) => {
  return (
    <div style={HONEYPOT_CONTAINER_STYLE} aria-hidden="true" tabIndex={-1}>
      <label htmlFor={`beech-hp-${name}`}>{label}</label>
      <input
        id={`beech-hp-${name}`}
        type="text"
        name={name}
        value={value}
        tabIndex={-1}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
```

#### `packages/forms-react/src/components/FormField.tsx`
```tsx
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { FC } from 'react'
import type { FormBranchSchema, UseBeechFormReturn } from '../types.js'

export interface FormFieldProps {
  branch: FormBranchSchema
  form: UseBeechFormReturn
  className?: string
}

export const FormField: FC<FormFieldProps> = ({ branch, form, className = 'beech-form-field' }) => {
  if (!form.isFieldVisible(branch.alias)) {
    return null
  }

  const { alias, label, type, placeholder, options, helpText } = branch
  const reg = form.register(alias)
  const error = form.touched[alias] ? form.errors[alias] : undefined
  const fieldId = `beech-field-${alias}`

  return (
    <div className={className} data-field={alias} data-type={type}>
      {label && (
        <label htmlFor={fieldId} className="beech-label">
          {label}
          {branch.required && <span className="beech-required-mark" aria-hidden="true"> *</span>}
        </label>
      )}

      {type === 'text' ? (
        <textarea
          id={fieldId}
          placeholder={placeholder}
          className={`beech-input beech-textarea ${error ? 'beech-input-error' : ''}`}
          {...reg}
        />
      ) : type === 'select' ? (
        <select
          id={fieldId}
          className={`beech-input beech-select ${error ? 'beech-input-error' : ''}`}
          {...reg}
        >
          <option value="">{placeholder || '-- Seleziona --'}</option>
          {options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : type === 'boolean' ? (
        <div className="beech-checkbox-wrapper">
          <input
            id={fieldId}
            type="checkbox"
            checked={Boolean(form.values[alias])}
            className="beech-checkbox"
            {...reg}
          />
          {placeholder && <label htmlFor={fieldId}>{placeholder}</label>}
        </div>
      ) : type === 'file' ? (
        <input
          id={fieldId}
          type="file"
          accept={branch.accept}
          className={`beech-input beech-file ${error ? 'beech-input-error' : ''}`}
          onChange={(e) => form.handleFileChange(alias, e.target.files?.[0] ?? null)}
          aria-invalid={reg['aria-invalid']}
          aria-required={reg['aria-required']}
          aria-describedby={reg['aria-describedby']}
        />
      ) : (
        <input
          id={fieldId}
          type={type === 'email' ? 'email' : type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'}
          placeholder={placeholder}
          className={`beech-input ${error ? 'beech-input-error' : ''}`}
          {...reg}
        />
      )}

      {helpText && <p className="beech-help-text">{helpText}</p>}
      {error && (
        <p id={`${alias}-error`} className="beech-error-text" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
```

#### `packages/forms-react/src/components/BeechForm.tsx`
```tsx
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { FC } from 'react'
import type { BeechFormProps } from '../types.js'
import { useBeechForm } from '../hooks/useBeechForm.js'
import { HoneypotField } from './HoneypotField.js'
import { FormField } from './FormField.js'

export const BeechForm: FC<BeechFormProps> = (props) => {
  const { className = 'beech-form', children, ...options } = props
  const form = useBeechForm(options)
  const schema = typeof options.seed === 'object' ? options.seed : null

  return (
    <form className={className} onSubmit={form.handleSubmit} noValidate>
      {/* Camouflage Honeypot Decoy */}
      <HoneypotField
        name={form.honeypotName}
        value={form.honeypotValue}
        onChange={form.setHoneypotValue}
        label={form.translations.honeypotLabel}
      />

      {/* Draft Restored Banner */}
      {form.isDraftRestored && !form.isSuccess && (
        <div className="beech-alert beech-alert-info" role="status">
          <span>{form.translations.draftRestored}</span>
          <button type="button" onClick={form.clearDraft} className="beech-btn-link">
            &times;
          </button>
        </div>
      )}

      {/* Server Error Banner */}
      {form.serverError && (
        <div className="beech-alert beech-alert-error" role="alert">
          <strong>{form.translations.errorTitle}: </strong>
          <span>{form.serverError}</span>
        </div>
      )}

      {/* Success View */}
      {form.isSuccess ? (
        <div className="beech-alert beech-alert-success" role="status">
          <h3>{form.translations.successTitle}</h3>
          <p>{form.translations.successMessage}</p>
        </div>
      ) : typeof children === 'function' ? (
        children(form)
      ) : children ? (
        children
      ) : schema ? (
        <>
          {schema.branches.map((branch) => (
            <FormField key={branch.alias} branch={branch} form={form} />
          ))}
          <button type="submit" disabled={form.isSubmitting} className="beech-submit-btn">
            {form.isSubmitting ? form.translations.submittingButton : form.translations.submitButton}
          </button>
        </>
      ) : null}
    </form>
  )
}
```

---

### 7. Public Package Exports (`packages/forms-react/src/index.ts`)

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export { BeechForm } from './components/BeechForm.js'
export { FormField } from './components/FormField.js'
export { HoneypotField } from './components/HoneypotField.js'
export { useBeechForm } from './hooks/useBeechForm.js'
export { evaluateCondition, evaluateSingleCondition } from './core/conditional-logic.js'
export { saveFormDraft, loadFormDraft, clearFormDraft, getDraftStorageKey } from './core/draft-storage.js'
export { fetchTimeTrapToken } from './core/time-trap.js'
export { verifyClientMagicBytes, fileToAttachment } from './core/file-uploader.js'
export { translationsIT, translationsEN, getTranslations } from './i18n/translations.js'
export { DEFAULT_HONEYPOT_NAME, HONEYPOT_DECOYS, HONEYPOT_CONTAINER_STYLE } from './core/honeypot.js'
export type {
  BeechFormProps,
  UseBeechFormOptions,
  UseBeechFormReturn,
  FormFieldProps,
  HoneypotFieldProps,
  FormSeedSchema,
  FormBranchSchema,
  FormBranchType,
  ConditionalRule,
  ConditionalOperator,
  FormFileAttachment,
  FormTranslations,
  Locale,
} from './types.js'
```

---

### 8. Comprehensive Test Suite

#### `packages/forms-react/src/test/conditional-logic.test.ts`
- Tests all operators (`eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `not_in`, `is_empty`, `is_not_empty`, `contains`).
- Tests compound AND rule arrays.

#### `packages/forms-react/src/test/draft-storage.test.ts`
- Tests saving, loading, and clearing localStorage entries.
- Verifies exclusion of file buffers and internal private fields.

#### `packages/forms-react/src/test/file-uploader.test.ts`
- Tests `verifyClientMagicBytes` for PDF (`%PDF-`), PNG, JPEG, GIF, WebP signatures.
- Tests rejection of spoofed extensions (e.g. `.pdf` containing arbitrary text).

#### `packages/forms-react/src/test/useBeechForm.test.ts`
- Tests form state lifecycle: values, touch, validation errors, reset.
- Tests honeypot rejection when bot values are provided.
- Tests draft auto-recovery and clear on submit.

#### `packages/forms-react/src/test/BeechForm.test.tsx`
- Tests schema-driven automatic rendering with WAI-ARIA attributes.
- Tests conditional field hiding/showing on user input change.
- Tests bilingual Italian/English label switching.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================
Execute the following verification commands to validate the new package:

1. **Build the `@beechcms/forms-react` Package:**
   ```bash
   pnpm --filter @beechcms/forms-react run build
   ```

2. **Typecheck the `@beechcms/forms-react` Package:**
   ```bash
   pnpm --filter @beechcms/forms-react run type-check
   ```

3. **Run `@beechcms/forms-react` Test Suite:**
   ```bash
   pnpm --filter @beechcms/forms-react test
   ```

4. **Run Full Monorepo Test Suite:**
   ```bash
   pnpm beech test
   ```

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================
- [ ] `packages/forms-react/package.json` created and linked into pnpm workspace.
- [ ] TypeScript compilation (`tsc`) succeeds with zero errors and generates `.d.ts` declaration maps.
- [ ] Honeypot decoy field (`fax_number`) renders with `tabIndex={-1}`, `aria-hidden="true"`, and offscreen positioning.
- [ ] Time Trap token is automatically requested on mount and passed in `POST /api/v1/public/:seed/add`.
- [ ] LocalDraft recovery automatically persists input to `localStorage` under `beech_form_draft_<seed>` and clears on successful submit.
- [ ] Conditional visibility rules (`dependsOn`) dynamically show/hide fields based on form state and filter out hidden fields from submission payload.
- [ ] Synchronous Magic Bytes verification validates PDF, PNG, JPEG, GIF, and WebP attachments before upload.
- [ ] Native i18n provides 100% coverage for Italian (`it`) and English (`en`) UI strings and validation errors.
- [ ] Accessible WAI-ARIA attributes (`aria-required`, `aria-invalid`, `aria-describedby`, `<label htmlFor="...">`) are rendered on all inputs.
- [ ] 100% unit and component tests in `packages/forms-react/src/test/` pass without warnings.
- [ ] Monorepo build and `pnpm beech test` pass cleanly.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================
- **Blind Index Columns / Client SHA-256 Hashes**: Discarded. Public form inputs are sent in clear over HTTPS and encrypted at rest by the server.
- **Admin / Dashboard Login Forms**: Discarded. Forms-react is exclusively for public content ingestion (`/api/v1/public/:seed/add`).
- **Blocking Visual CAPTCHAs**: Discarded. Anti-bot defense uses invisible Honeypot and Time Trap tokens.
- **Direct Database / D1 Queries in Client**: Discarded. Client SDK interacts strictly via HTTP endpoints.

HANDOFF -> caveman_coder
