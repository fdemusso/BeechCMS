### Pre-Computation Analysis

1. **God Nodes Identified:**
   - `publicAddHandler` (`apps/api/src/public/public-add.ts` L31): Central entry point for public content submissions (`POST /api/v1/public/:seed/add`), orchestrating access control, idempotency, anti-bot validation, payload sanitization, privacy encryption, and event notification.
   - `sanitizePublicPayload` (`apps/api/src/public/sanitize.ts` L26): The core schema validator and sanitizer for incoming public form payloads.
   - `publicRateLimitMiddleware` (`apps/api/src/public/rate-limit-middleware.ts` L14): Edge rate limiter enforcing request thresholds on public endpoints.
   - `createBeechApp` (`apps/api/src/factory.ts` L134): Monorepo application factory orchestrating middleware pipelines, CORS, security headers, and public/protected routing boundaries.
   - `uploadRoutes` (`apps/api/src/features/upload/index.ts` L52): Media upload presigning and direct R2 ingestion pipeline.

2. **Architectural Boundaries Affected:**
   - `@beechcms/core`:
     - `packages/core/src/engine/types.ts`: Add `retentionDays?: number` property to `Seed` interface.
     - `packages/core/src/engine/seed-validation.ts`: Add validation rule for `retentionDays` (positive integer >= 1).
     - `packages/core/src/media/magic-bytes.ts`: Implement synchronous (< 5ms) edge-native `verifyMagicBytes` inspecting first 16 bytes for allowed document/image MIME types.
     - `packages/core/src/antivirus/antivirus.interface.ts`: Define `IAntivirusProvider`, `AntivirusScanResult`, and `AntivirusStatus` contracts.
     - `packages/core/src/antivirus/virustotal-antivirus.provider.ts`: Implement `VirusTotalAntivirusProvider` with fast SHA-256 lookup and upload fallback using Web `fetch`.
     - `packages/core/src/antivirus/noop-antivirus.provider.ts`: Implement fallback `NoopAntivirusProvider` when no API key is provided.
     - `packages/core/src/security/time-trap.ts`: Implement `generateTimeTrapToken` and `verifyTimeTrapToken` using `crypto.subtle` HMAC SHA-256.
     - `packages/core/src/index.ts`: Re-export all new security, validation, and antivirus modules.
   - `apps/api`:
     - `apps/api/src/types.ts`: Extend `Env` with `VIRUSTOTAL_API_KEY?: string`, `PUBLIC_TIME_TRAP_SECRET?: string`, `ALLOWED_ORIGINS?: string`; extend `Variables` with `antivirusProvider: IAntivirusProvider`.
     - `apps/api/src/middleware/repository.middleware.ts`: Instantiate and inject `antivirusProvider` into Hono Context.
     - `apps/api/src/public/public-routes.ts`: Mount `GET /timetrap/token` endpoint providing signed timestamp tokens for public forms.
     - `apps/api/src/public/public-add.ts`: Apply 5-level anti-bot defense (strict origin validation, camouflage honeypot detection, signed time-trap verification with $\Delta t \ge 1.5$s), synchronous magic bytes check for uploaded file attachments, and async quarantine scanning via `context.get('scheduler').waitUntil()`.
   - `apps/dashboard`: Unaffected (dashboard uses authenticated APIs and media management).

3. **Graphify Impact Analysis (`graphify affected`):**
   - Affected nodes for `publicAddHandler`:
     - `apps/api/src/public/public-routes.ts` (route registration)
     - `apps/api/src/public/index.ts` (public module re-exports)
     - `apps/api/src/factory.ts` (app factory mounting)
   - Affected nodes for `sanitizePublicPayload`:
     - `apps/api/src/public/public-add.ts` (`publicAddHandler`)
     - `apps/api/src/public/public-edit.ts` (`publicEditHandler`)
     - `apps/api/test/core-validation.test.ts`
   - Affected nodes for `publicRateLimitMiddleware`:
     - `apps/api/src/factory.ts` (`createBeechApp`)
     - `apps/api/src/public/rate-limit-middleware.test.ts`
     - `apps/api/test/public-routes.test.ts`

---

### VETO Audit

- **Botanical Dialect Compliance:** Confirmed. All data ingestion, field sanitization, and entity creation in `publicAddHandler` strictly pass through `@beechcms/core` (`sanitizePublicPayload`, `applyPrivacy`, and `repository.create` parameterized via Seed/Branch aliases). No raw D1 queries or SQLite statements bypass `@beechcms/core`.
- **Vertical Slice Architecture (VSA):** Confirmed. All anti-bot token primitives, magic bytes verification, and antivirus interfaces live entirely within `@beechcms/core`. The public feature slice in `apps/api/src/public/` consumes core exports directly without cross-importing from internal slices (`apps/api/src/features/content`, `auth`, etc.).
- **Cloudflare Edge Purity:** Confirmed. All cryptographic signatures use standard `crypto.subtle` (Web Crypto API). Magic Bytes inspection operates on in-memory `Uint8Array` slices in under 5ms. Antivirus operations are non-blocking and scheduled via `context.get('scheduler').waitUntil(...)` using standard `fetch`, strictly avoiding Node.js native addons, heavy external libraries, or blocking worker execution.

---

# Sprint Output Template (Strictly Enforced)

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================
This sprint establishes the backend security, anti-bot defenses, file signature validation, and asynchronous quarantine scanning required to protect public form submissions (`POST /api/v1/public/:seed/add`) without friction for human users.

While Sprints 1–3 solved data classification, at-rest encryption, and context-aware API read filtering, public form endpoints remain vulnerable to automated bot spam, spoofed file attachments, and malicious payloads. Building the backend security primitives and validation endpoints first is mandatory before developing the client-side Form SDK (`@beechcms/forms-react`), ensuring that the frontend toolkit integrates with fully validated, edge-compatible security contracts on the API.

In accordance with BeechCMS invariants:
1. **Botanical Engine Invariant**: The `Seed` schema is extended with GDPR data retention metadata (`retentionDays`) and media branches benefit from synchronous file signature inspection.
2. **Edge Purity & Controlled Rejection**: Bot attacks (Honeypot triggers and Time Trap violations $\Delta t < 1.5\text{s}$) are rejected with explicit HTTP errors (`400 Bad Request` or `422 Unprocessable Entity`) and security activity logging, ensuring that real submissions are never silently discarded.
3. **Asynchronous Edge Quarantine**: Antivirus scanning is orchestrated non-blockingly at the Edge via `c.get('scheduler').waitUntil(...)` with native VirusTotal API support, ensuring form submissions return immediately (< 300ms) while safeguarding media storage.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================
- **God Nodes Identified:** `publicAddHandler` (`apps/api/src/public/public-add.ts`), `sanitizePublicPayload` (`apps/api/src/public/sanitize.ts`), `publicRateLimitMiddleware` (`apps/api/src/public/rate-limit-middleware.ts`), `createBeechApp` (`apps/api/src/factory.ts`).
- **Core Interfaces & Functions:**
  - `Seed` in `packages/core/src/engine/types.ts` defines schema configurations but lacks `retentionDays`.
  - `isMimeAccepted` in `packages/core/src/media/file-types.ts` checks MIME string extensions but does not inspect binary file signatures (Magic Bytes).
  - `publicAddHandler` in `apps/api/src/public/public-add.ts` performs schema sanitization (`sanitizePublicPayload`), public permission checks (`checkPublicOperation`), and privacy encryption (`applyPrivacy`), but does not evaluate Honeypot decoy fields, Time Trap tokens, or origin whitelisting.
  - `apps/api/src/middleware/repository.middleware.ts` injects core repositories and services into Hono Context but currently lacks `IAntivirusProvider`.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================
- `@beechcms/core` (`packages/core/`):
  - Add `retentionDays?: number` to `Seed` interface in `packages/core/src/engine/types.ts` and validation in `packages/core/src/engine/seed-validation.ts`.
  - Pure synchronous function `verifyMagicBytes(buffer: ArrayBuffer | Uint8Array, declaredMime: string)` in `packages/core/src/media/magic-bytes.ts` supporting PDF, PNG, JPEG, GIF, and WebP.
  - Anti-bot cryptographic token helpers `generateTimeTrapToken(secret: string, timestamp?: number): Promise<string>` and `verifyTimeTrapToken(token: string, secret: string, minDeltaSeconds?: number, maxAgeSeconds?: number): Promise<{ valid: boolean; reason?: string; elapsedSeconds?: number }>` in `packages/core/src/security/time-trap.ts`.
  - `IAntivirusProvider` interface and `AntivirusScanResult` type in `packages/core/src/antivirus/antivirus.interface.ts`.
  - `VirusTotalAntivirusProvider` class in `packages/core/src/antivirus/virustotal-antivirus.provider.ts` and `NoopAntivirusProvider` fallback in `packages/core/src/antivirus/noop-antivirus.provider.ts`.
  - Unit test suites in `packages/core/src/media/magic-bytes.test.ts`, `packages/core/src/security/time-trap.test.ts`, and `packages/core/src/antivirus/virustotal-antivirus.provider.test.ts`.
- `apps/api` (`apps/api/`):
  - Add `VIRUSTOTAL_API_KEY?: string`, `PUBLIC_TIME_TRAP_SECRET?: string`, `ALLOWED_ORIGINS?: string` to `Env` in `apps/api/src/types.ts`.
  - Add `antivirusProvider: IAntivirusProvider` to `Variables` in `apps/api/src/types.ts` and inject it in `apps/api/src/middleware/repository.middleware.ts`.
  - Add `GET /api/v1/public/timetrap/token` endpoint in `apps/api/src/public/public-routes.ts` generating signed $t_0$ tokens.
  - Update `publicAddHandler` in `apps/api/src/public/public-add.ts`:
    - Strict Origin Check against `ALLOWED_ORIGINS` (returning `403 Forbidden` if disallowed).
    - Camouflage Honeypot inspection checking realistic decoy fields (`fax_number`, `website_url`, `middle_name`, `secondary_phone`, `_gotcha`, `honeypot`) (returning `422 Unprocessable Entity` if filled).
    - Time Trap verification evaluating `_timeTrapToken` or `x-time-trap` header (returning `422 Unprocessable Entity` if $\Delta t < 1.5\text{s}$ or signature invalid).
    - Attachment Magic Bytes verification for base64/binary payloads (returning `400 Bad Request` on signature mismatch).
    - Asynchronous VirusTotal quarantine scan scheduled via `context.get('scheduler').waitUntil(...)`.
  - Unit and integration tests in `apps/api/test/public-anti-bot.test.ts` and `apps/api/src/public/public-add.test.ts`.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

1. **Extend `Seed` with `retentionDays` in `@beechcms/core`:**
   - In `packages/core/src/engine/types.ts`:
     ```ts
     export interface Seed {
       // ... existing properties
       /**
        * Number of days to retain entries before automatic cleanup or anonymization (GDPR compliance).
        * Must be a positive integer (>= 1) when specified.
        */
       retentionDays?: number
     }
     ```
   - In `packages/core/src/engine/seed-validation.ts`:
     Add validation checking `if (seed.retentionDays !== undefined && (!Number.isInteger(seed.retentionDays) || seed.retentionDays <= 0))`: throw descriptive validation error.

2. **Implement Magic Bytes File Signature Verification in `@beechcms/core/src/media/magic-bytes.ts`:**
   - Define signatures for PDF, PNG, JPEG, GIF, and WebP:
     ```ts
     export interface MagicBytesValidationResult {
       valid: boolean
       detectedMime?: string
       error?: string
     }

     export function verifyMagicBytes(
       buffer: ArrayBuffer | Uint8Array,
       declaredMime: string
     ): MagicBytesValidationResult {
       const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
       if (bytes.length < 4) {
         return { valid: false, error: 'File buffer too small for signature inspection' }
       }

       const normalizedDeclared = declaredMime.split(';')[0].trim().toLowerCase()

       // PDF: %PDF- (0x25 0x50 0x44 0x46 0x2D)
       if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
         return normalizedDeclared === 'application/pdf'
           ? { valid: true, detectedMime: 'application/pdf' }
           : { valid: false, detectedMime: 'application/pdf', error: `Signature mismatch: file is PDF but declared as ${declaredMime}` }
       }

       // PNG: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
       if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
         return normalizedDeclared === 'image/png'
           ? { valid: true, detectedMime: 'image/png' }
           : { valid: false, detectedMime: 'image/png', error: `Signature mismatch: file is PNG but declared as ${declaredMime}` }
       }

       // JPEG: 0xFF 0xD8 0xFF
       if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
         return normalizedDeclared === 'image/jpeg' || normalizedDeclared === 'image/jpg'
           ? { valid: true, detectedMime: 'image/jpeg' }
           : { valid: false, detectedMime: 'image/jpeg', error: `Signature mismatch: file is JPEG but declared as ${declaredMime}` }
       }

       // GIF: GIF87a or GIF89a (0x47 0x49 0x46 0x38)
       if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
         return normalizedDeclared === 'image/gif'
           ? { valid: true, detectedMime: 'image/gif' }
           : { valid: false, detectedMime: 'image/gif', error: `Signature mismatch: file is GIF but declared as ${declaredMime}` }
       }

       // WebP: RIFF....WEBP (0x52 0x49 0x46 0x46 ... 0x57 0x45 0x42 0x50)
       if (
         bytes.length >= 12 &&
         bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
         bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
       ) {
         return normalizedDeclared === 'image/webp'
           ? { valid: true, detectedMime: 'image/webp' }
           : { valid: false, detectedMime: 'image/webp', error: `Signature mismatch: file is WebP but declared as ${declaredMime}` }
       }

       // Allow text/plain and other non-binary types without strict magic bytes if declared
       if (normalizedDeclared === 'text/plain' || normalizedDeclared === 'text/csv') {
         return { valid: true, detectedMime: normalizedDeclared }
       }

       return { valid: false, error: `Unrecognized file signature for declared MIME ${declaredMime}` }
     }
     ```

3. **Implement Time Trap Cryptographic Primitives in `@beechcms/core/src/security/time-trap.ts`:**
   - Use `crypto.subtle` for HMAC SHA-256 signatures:
     ```ts
     async function getHmacKey(secret: string): Promise<CryptoKey> {
       return crypto.subtle.importKey(
         'raw',
         new TextEncoder().encode(secret),
         { name: 'HMAC', hash: 'SHA-256' },
         false,
         ['sign', 'verify']
       )
     }

     export async function generateTimeTrapToken(secret: string, timestampSeconds?: number): Promise<string> {
       const t0 = timestampSeconds ?? Math.floor(Date.now() / 1000)
       const payload = `t0_${t0}`
       const key = await getHmacKey(secret)
       const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
       const sigHex = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('')
       return `${payload}.${sigHex}`
     }

     export async function verifyTimeTrapToken(
       token: string,
       secret: string,
       minDeltaSeconds: number = 1.5,
       maxAgeSeconds: number = 3600
     ): Promise<{ valid: boolean; reason?: string; elapsedSeconds?: number }> {
       if (!token || typeof token !== 'string') {
         return { valid: false, reason: 'Missing or invalid token format' }
       }
       const parts = token.split('.')
       if (parts.length !== 2) {
         return { valid: false, reason: 'Malformed token structure' }
       }
       const [payload, sigHex] = parts
       if (!payload.startsWith('t0_')) {
         return { valid: false, reason: 'Invalid token prefix' }
       }

       const t0 = Number.parseInt(payload.slice(3), 10)
       if (!Number.isFinite(t0)) {
         return { valid: false, reason: 'Invalid timestamp value' }
       }

       const key = await getHmacKey(secret)
       const sigBytes = new Uint8Array(sigHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) ?? [])
       const isValidSig = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(payload))
       if (!isValidSig) {
         return { valid: false, reason: 'Cryptographic signature mismatch' }
       }

       const now = Date.now() / 1000
       const elapsed = now - t0

       if (elapsed < minDeltaSeconds) {
         return { valid: false, reason: `Submission too fast (${elapsed.toFixed(2)}s < ${minDeltaSeconds}s)`, elapsedSeconds: elapsed }
       }
       if (elapsed > maxAgeSeconds) {
         return { valid: false, reason: `Token expired (${elapsed.toFixed(0)}s > ${maxAgeSeconds}s)`, elapsedSeconds: elapsed }
       }

       return { valid: true, elapsedSeconds: elapsed }
     }
     ```

4. **Implement Antivirus Abstraction & VirusTotal Provider in `@beechcms/core/src/antivirus/`:**
   - In `antivirus.interface.ts`:
     ```ts
     export type AntivirusStatus = 'clean' | 'infected' | 'skipped' | 'error'
     export interface AntivirusScanResult {
       status: AntivirusStatus
       provider: string
       details?: string
       threatName?: string
     }
     export interface IAntivirusProvider {
       readonly name: string
       scan(fileBuffer: ArrayBuffer | Uint8Array, filename: string): Promise<AntivirusScanResult>
     }
     ```
   - In `virustotal-antivirus.provider.ts`:
     ```ts
     import { sha256hex } from '../engine/policies.js'
     import type { IAntivirusProvider, AntivirusScanResult } from './antivirus.interface.js'

     export class VirusTotalAntivirusProvider implements IAntivirusProvider {
       readonly name = 'virustotal'
       constructor(private readonly apiKey?: string) {}

       async scan(fileBuffer: ArrayBuffer | Uint8Array, filename: string): Promise<AntivirusScanResult> {
         if (!this.apiKey) {
           return { status: 'skipped', provider: this.name, details: 'API key not configured' }
         }

         const bytes = fileBuffer instanceof Uint8Array ? fileBuffer : new Uint8Array(fileBuffer)
         const hashBuffer = await crypto.subtle.digest('SHA-256', bytes)
         const hash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')

         try {
           const res = await fetch(`https://www.virustotal.com/api/v3/files/${hash}`, {
             headers: { 'x-apikey': this.apiKey },
           })

           if (res.status === 200) {
             const data = await res.json() as any
             const stats = data?.data?.attributes?.last_analysis_stats
             const malicious = (stats?.malicious ?? 0) + (stats?.suspicious ?? 0)
             if (malicious > 0) {
               return { status: 'infected', provider: this.name, details: `Detected by ${malicious} security engines` }
             }
             return { status: 'clean', provider: this.name }
           }

           if (res.status === 404) {
             const formData = new FormData()
             formData.append('file', new Blob([bytes]), filename)
             const uploadRes = await fetch('https://www.virustotal.com/api/v3/files', {
               method: 'POST',
               headers: { 'x-apikey': this.apiKey },
               body: formData,
             })
             if (!uploadRes.ok) {
               return { status: 'error', provider: this.name, details: `Upload scan error: ${uploadRes.status}` }
             }
             return { status: 'clean', provider: this.name, details: 'Queued for background analysis' }
           }

           return { status: 'error', provider: this.name, details: `VirusTotal lookup returned ${res.status}` }
         } catch (error) {
           return { status: 'error', provider: this.name, details: error instanceof Error ? error.message : 'Scan request failed' }
         }
       }
     }
     ```

5. **Update API Types & Repository Middleware (`apps/api/`):**
   - In `apps/api/src/types.ts`:
     ```ts
     export interface Env {
       // ... existing bindings
       VIRUSTOTAL_API_KEY?: string
       PUBLIC_TIME_TRAP_SECRET?: string
       ALLOWED_ORIGINS?: string
     }
     export interface Variables {
       // ... existing variables
       antivirusProvider: IAntivirusProvider
     }
     ```
   - In `apps/api/src/middleware/repository.middleware.ts`:
     Instantiate `new VirusTotalAntivirusProvider(c.env.VIRUSTOTAL_API_KEY)` and inject into `c.set('antivirusProvider', ...)`.

6. **Add Token Endpoint & Harden `publicAddHandler` (`apps/api/src/public/`):**
   - In `apps/api/src/public/public-routes.ts`:
     ```ts
     publicApp.get('/timetrap/token', async (c) => {
       const secret = c.env.PUBLIC_TIME_TRAP_SECRET || 'beech-public-timetrap-default-secret'
       const token = await generateTimeTrapToken(secret)
       return c.json({ token, minDeltaSeconds: 1.5 }, 200)
     })
     ```
   - In `apps/api/src/public/public-add.ts`:
     - **Strict Origin Check**:
       ```ts
       const allowedOrigins = context.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean)
       const origin = context.req.header('Origin') || context.req.header('Referer')
       if (allowedOrigins && allowedOrigins.length > 0 && origin) {
         const originHost = new URL(origin).origin
         if (!allowedOrigins.includes(originHost)) {
           return publicProblem(context, { type: 'forbidden-origin', title: 'Forbidden', status: 403, detail: `Requests from origin '${originHost}' are not allowed.` })
         }
       }
       ```
     - **Camouflage Honeypot Inspection**:
       ```ts
       const DECOY_FIELDS = ['fax_number', 'website_url', 'middle_name', 'secondary_phone', '_gotcha', 'honeypot']
       for (const decoy of DECOY_FIELDS) {
         if (body[decoy] || (rawData && rawData[decoy])) {
           context.get('activityLogger').log({
             action: 'security_alert',
             entityType: 'content',
             entityId: 'honeypot_trap',
             details: { decoy, ip: context.req.header('cf-connecting-ip') },
             actor: { id: 'public', email: 'bot@honeypot.local', name: 'Bot Trap' },
           })
           return publicProblem(context, { type: 'honeypot-triggered', title: 'Unprocessable Entity', status: 422, detail: 'Bot submission detected.' })
         }
       }
       ```
     - **Time Trap Token Verification**:
       ```ts
       const token = (body._timeTrapToken as string) || context.req.header('x-time-trap')
       if (token) {
         const secret = context.env.PUBLIC_TIME_TRAP_SECRET || 'beech-public-timetrap-default-secret'
         const verification = await verifyTimeTrapToken(token, secret, 1.5)
         if (!verification.valid) {
           return publicProblem(context, { type: 'time-trap-violation', title: 'Unprocessable Entity', status: 422, detail: verification.reason || 'Invalid submission timing.' })
         }
       }
       ```
     - **Attachment Inspection & Quarantine Execution**:
       For submitted file branches containing attachment data:
       Verify Magic Bytes synchronously. If invalid, return `400 Bad Request`.
       If valid and VirusTotal API is active, schedule background scan via:
       ```ts
       context.get('scheduler').waitUntil((async () => {
         const av = context.get('antivirusProvider')
         const result = await av.scan(fileBuffer, filename)
         if (result.status === 'infected') {
           await context.get('bucket').delete(fileKey)
           context.get('notificationService').notify({
             title: 'Security Alert: Infected file detected',
             message: `Attachment '${filename}' submitted to seed '${seedSlug}' was infected (${result.details}) and deleted.`,
             type: 'error',
           })
         }
       })())
       ```

==========================================================================
SECTION 5 — VALIDATION
==========================================================================
- `pnpm --filter @beechcms/core run build`
- `pnpm --filter @beechcms/core test`
- `npx tsc --noEmit` in `apps/api/`
- `pnpm --filter api test`
- `pnpm beech test`

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================
- [ ] `retentionDays?: number` is defined on `Seed` interface in `@beechcms/core` and validated as positive integer in `seed-validation.ts`.
- [ ] `verifyMagicBytes` accurately detects PDF, PNG, JPEG, GIF, and WebP signatures in < 5ms and rejects mismatched/falsified file extensions.
- [ ] `generateTimeTrapToken` and `verifyTimeTrapToken` correctly issue and verify HMAC SHA-256 tokens and reject submissions with $\Delta t < 1.5\text{s}$ or invalid signatures.
- [ ] `IAntivirusProvider` contract and `VirusTotalAntivirusProvider` class operate seamlessly without blocking Worker execution.
- [ ] `GET /api/v1/public/timetrap/token` returns a fresh signed token for public consumers.
- [ ] `POST /api/v1/public/:seed/add` enforces strict origin checks, honeypot decoy rejection (`422`), time-trap delta verification (`422`), and synchronous file signature inspection (`400`).
- [ ] Asynchronous quarantine scan properly triggers admin error notification and removes infected files from storage.
- [ ] All unit and integration test suites in `@beechcms/core` and `apps/api` pass with 0 type errors or test failures.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================
- **React Form Component (`<BeechForm />`) & Form SDK:** Building the `@beechcms/forms-react` client package, form field renderers, LocalStorage draft hook, and dynamic form rendering is deferred to **Sprint 5** (refer to `ROADMAP.md`).
- **Automated Data Retention Cron Job:** Implementing the scheduled cron task runner to delete/anonymize records older than `retentionDays` is deferred to the **Scheduled Automation Engine** sprint.
- **Client-Side Form Validation UI:** Rendering validation errors and i18n messages in the browser DOM is deferred to **Sprint 5**.
- **Admin Dashboard Media Quarantine Tab:** Developing specialized quarantine view dialogs in `apps/dashboard` is deferred to future dashboard enhancement sprints.
