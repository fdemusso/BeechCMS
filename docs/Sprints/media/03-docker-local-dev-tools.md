# Sprint 03 — Docker-First Local Dev Suite (Mailpit + SQLite Web + Cloudflared Tunnel)

Questo documento è una **specifica eseguibile**: ogni task contiene path assoluti, snippet del codice attuale, contratti precisi e criteri di accettazione. Un agente IA deve poterla completare senza ulteriore navigazione del codice (a parte i file elencati).

> Versione: 1.0 — branch `seed-bugfix`, dopo lo Sprint 02 (presigned URLs, MinIO).
> Prerequisito: lo Sprint 02 è stato applicato (esiste `docker-compose.yml` con `minio` + `minio-init`, `pnpm run dev:full` è il comando canonico, `apps/api/.dev.vars.example` contiene `R2_*`).

---

## 0. Principio guida (READ-FIRST)

**Zero dipendenze esterne, zero mock invisibili, zero codice "tanto in dev funziona così".**

Lo sviluppo locale di Beech deve poter girare **offline** e i test devono usare **gli stessi servizi reali** che il dev usa nel browser. Tutto ciò che oggi è simulato — email loggate in console, R2 mockato in vitest con `vi.mock('@aws-sdk/client-s3')`, webhook puntati a `webhook.site` (che scade con 404), database D1 ispezionato a colpi di `wrangler d1 execute` — diventa un container Docker permanente.

| Dominio | Stato attuale | Nuovo strumento | Sostituisce |
|---|---|---|---|
| **Email** | `ResendEmailProvider` chiama Resend HTTP in prod; in dev richiede `RESEND_API_KEY` e brucia quota reale, oppure fallisce | `axllent/mailpit` (SMTP 1025 + HTTP send API 8025 + Web UI 8025) tramite nuovo `SmtpEmailProvider` | Resend in dev/test |
| **Storage R2** | `S3Bucket` → MinIO (Sprint 02). I test vitest **mockano `@aws-sdk/client-s3`** con `vi.hoisted(...)` in `flow-media-assets.test.ts` e `test/mocks/mock-r2-client.ts` | `S3Bucket` punta a MinIO sia in dev sia in test (test usano MinIO reale con bucket effimero per test) | `vi.mock('@aws-sdk/...')`, `mock-r2-client.ts` |
| **Webhook** | Documentazione consiglia `webhook.site`; test usano `vi.stubGlobal('fetch', ...)` in `action-executors.test.ts` | `cloudflare/cloudflared` quick tunnel + `webhook-tester` container locale (`tarampampam/webhook-tester` o equivalente) per assertare ricezione nei test | `webhook.site`, `vi.stubGlobal('fetch')` per webhook |
| **D1 inspection** | `wrangler d1 execute --local --command "..."` | `coleifer/sqlite-web` montato su `apps/api/.wrangler/state/v3/d1` | CLI ad-hoc |

| Decisione | Valore | Motivo |
|---|---|---|
| Provider email in dev/test | `SmtpEmailProvider` via Mailpit HTTP send API (`POST http://localhost:8025/api/v1/send`) | Cloudflare Workers non supportano nativamente socket SMTP raw; la HTTP API di Mailpit è equivalente e compatibile con `fetch` del Worker runtime |
| Provider email in prod | `ResendEmailProvider` (invariato) | Switch via env, **non** via build flag |
| Selettore | `EMAIL_PROVIDER` env var (`smtp` \| `resend`); default `resend` se assente | Esplicito e leggibile nei log |
| Trigger SMTP | `EMAIL_PROVIDER=smtp` + presenza di `SMTP_HOST` | Mailpit gira sempre quando si esegue `pnpm run dev:full` |
| Test integrazione | Vitest usa **realmente** Mailpit + MinIO + webhook-tester via container in attesa | Allinea test e prod path; elimina divergenza mock/reale già accumulata in passato |
| Test unitari puri (funzioni pure, validatori) | Restano senza Docker | Velocità |
| Webhook receiver locale | `tarampampam/webhook-tester` su porta `8084` | Equivalente self-hosted di webhook.site con HTTP API per leggere i payload ricevuti |
| Tunnel pubblico | `cloudflare/cloudflared:latest` quick tunnel su `8787` | Necessario solo per webhook **uscenti verso terzi** (es. testare callback da Stripe verso Beech); per webhook **entranti** generati da Beech basta `webhook-tester` |
| Docker prerequisito | Confermato (già stabilito nello Sprint 02) | Coerenza |
| Avvio dello stack | **Unico** comando `pnpm run dev:full`: avvia tutti i container + API + Dashboard | Niente percorsi alternativi, niente "modalità minimale". Docker è prerequisito non negoziabile per sviluppare su Beech. |
| Sqlite Web sicurezza | Solo bind `127.0.0.1:8080`, mai esposto esternamente | Il DB contiene hash password e token; nessuna auth nel viewer |

---

## 1. Contesto e parti coinvolte

### 1.1 File coinvolti

| Layer | File | Azione |
|---|---|---|
| Dev infra | `docker-compose.yml` (root repo) | **Modificare** — aggiungere `mailpit`, `sqlite-web`, `webhook-tester`, `tunnel` |
| Email provider SMTP | `apps/api/src/features/email/providers/smtp.ts` | **Creare** — implementa `EmailProvider` via Mailpit HTTP send API |
| Email factory | `apps/api/src/features/email/email.service.ts` | **Modificare** — `createProvider()` sceglie SMTP/Resend in base a `EMAIL_PROVIDER` |
| Env types | `apps/api/src/types.ts` | **Modificare** — aggiungere `EMAIL_PROVIDER?`, `SMTP_HOST?`, `SMTP_PORT?`, `WEBHOOK_TESTER_URL?` |
| Dev vars | `apps/api/.dev.vars.example` | **Modificare** — aggiungere blocchi SMTP + webhook tester |
| Wrangler config | `apps/api/wrangler.jsonc` | **Modificare** — aggiungere `vars.EMAIL_PROVIDER`, commento istruttivo |
| API bootstrap warning | `apps/api/src/index.ts` | **Modificare** — estendere il health check (`L29-37`) per Mailpit |
| Test email integration | `apps/api/test/email-smtp.integration.test.ts` | **Creare** — test reale contro Mailpit (skippato se container down) |
| Test media flow | `apps/api/test/flow-media-assets.test.ts` | **Riscrivere** — rimuovere `vi.mock('@aws-sdk/...')`, usare MinIO reale con bucket effimero per test (`beech-media-test-${uuid}`) |
| Test mock R2 | `apps/api/test/mocks/mock-r2-client.ts` | **Eliminare** |
| Test fixtures | `apps/api/test/fixtures.ts` | **Modificare** — aggiungere `TEST_ENV.EMAIL_PROVIDER='smtp'`, `SMTP_HOST='localhost'`, `SMTP_PORT='8025'`, `R2_*` puntati a MinIO test bucket |
| D1 test DB | `apps/api/test/helpers/d1-test-database.ts` | **Creare** — implementa `D1Database` reale su `better-sqlite3` (in-memory, FTS5, transazioni) |
| D1 seed helpers | `apps/api/test/helpers/seed-fixtures.ts` | **Creare** — `seedTestUsers(db, ...)` ecc.: incapsulano `INSERT` per fixture riusabili |
| Mock D1 | `apps/api/test/mocks/mock-d1-database.ts` | **Eliminare** — sostituito da `D1TestDatabase` reale |
| Static repos | `apps/api/test/mocks/static-content.repository.ts`, `static-idempotency.repository.ts` | **Valutare eliminazione** — con D1 reale i repository di prod (`D1ContentRepository`, `D1IdempotencyRepository`) funzionano direttamente nei test |
| Package API | `apps/api/package.json` | **Modificare** — aggiungere devDeps `better-sqlite3`, `@types/better-sqlite3` |
| CI workflow | `.github/workflows/test.yml` | **Modificare** — job `test-api` avvia gli stessi container del dev stack (MinIO, Mailpit, webhook-tester) prima di `pnpm test` |
| CI composite action | `.github/actions/docker-stack/action.yml` | **Creare** — passi riusabili per startup MinIO/Mailpit/webhook-tester, parità esatta con `docker-compose.yml` |
| Test action-executors | `apps/api/src/features/automations/__tests__/action-executors.test.ts` | **Riscrivere** — sostituire `vi.mock('../../email')` con assert reali contro Mailpit; sostituire `vi.stubGlobal('fetch')` per webhook con assert reali contro webhook-tester |
| Vitest config | `apps/api/vitest.config.ts` | **Modificare** — registrare due `globalSetup` in ordine: `docker-precheck.runner.ts` (precondizioni), poi `global-setup.ts` (fixture) |
| Docker precheck | `apps/api/test/docker-precheck.ts` | **Creare** — `assertDockerStackReady()` riusabile: pinga MinIO/Mailpit/webhook-tester in parallelo, throw aggregato actionable |
| Precheck runner | `apps/api/test/docker-precheck.runner.ts` | **Creare** — wrapper vitest globalSetup che invoca `assertDockerStackReady()` per primo, fail-fast |
| Vitest global setup | `apps/api/test/global-setup.ts` | **Creare** — re-invoca precheck + crea bucket MinIO effimero per il run |
| Test helper | `apps/api/test/helpers/mailpit-client.ts` | **Creare** — wrapper sulla Mailpit search API per leggere/svuotare la inbox |
| Test helper | `apps/api/test/helpers/webhook-tester-client.ts` | **Creare** — wrapper sulla webhook-tester API per leggere i payload |
| Test helper | `apps/api/test/helpers/minio-test-bucket.ts` | **Creare** — crea/elimina bucket effimero per test isolation |
| DB bootstrap | `apps/api/scripts/bootstrap-d1.mjs` | **Creare** — script idempotente che applica migrazioni 0000→ultima se il DB locale non esiste |
| Script API | `apps/api/package.json` | **Modificare** — `db:migrate:local` e `db:reset:local` delegano a `bootstrap-d1.mjs` |
| Script root | `package.json` (root) | **Modificare** — `dev` e `dev:full` diventano alias dello stesso comando (Docker + bootstrap-d1 + turbo dev); rimuovere `dev:storage`, `dev:storage:stop`, `dev:storage:reset`; aggiungere `dev:tunnel-url`, `dev:logs:*`, `dev:mailpit:reset`, `dev:stop`, `dev:reset` |
| Docs setup | `docs/development.md` | **Modificare** — sezione "Strumenti di Sviluppo Docker" + tabella porte + sezione Testing |
| Docs API | `docs/api-reference.md` | **Modificare** — nota su Mailpit nel paragrafo Email/Notifications |
| Docs architettura | `docs/architecture.md` | **Modificare** — sezione "Local Dev & Testing Infrastructure" |
| CLAUDE.md root | `CLAUDE.md` | **Modificare** — Tabella Tech Stack e Commands |
| README | `README.md` | **Modificare** — Quick start porta avanti i nuovi servizi |

### 1.2 Snippet di partenza (per riferimento, NON rileggere)

**`apps/api/src/features/email/email.service.ts` L36–38 — selezione provider attuale**
```typescript
function createProvider(apiKey: string, isDev: boolean): EmailProvider {
  return new ResendEmailProvider(apiKey, isDev)
}
```

**`apps/api/src/features/email/providers/resend.ts` L46–62 — pattern fetch da replicare**
```typescript
async send(email: OutboundEmail): Promise<void> {
  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(email),
  })
  if (!response.ok) { /* throw */ }
}
```

**`apps/api/src/types.ts` L26–32 — env email attuale**
```typescript
RESEND_API_KEY?: string
EMAIL_API_KEY?: string
APP_URL?: string
EMAIL_FROM?: string
```

**`apps/api/src/index.ts` L29–37 — healthcheck attuale da estendere**
```typescript
if (env.ENV === 'development' && env.R2_ENDPOINT) {
  fetch(env.R2_ENDPOINT + '/minio/health/live').catch(() => { /* warn */ })
}
```

**`apps/api/test/flow-media-assets.test.ts` L8–24 — mock da eliminare**
```typescript
const { mockS3Send, mockGetSignedUrl } = vi.hoisted(() => ({ mockS3Send: vi.fn(), mockGetSignedUrl: vi.fn() }))
vi.mock('@aws-sdk/client-s3', () => ({ S3Client: vi.fn(() => ({ send: mockS3Send })), /* ... */ }))
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: mockGetSignedUrl }))
```

**`apps/api/src/features/automations/__tests__/action-executors.test.ts` L99–101 — mock da eliminare**
```typescript
vi.mock('../../email', () => ({
  sendAutomationMail: vi.fn().mockResolvedValue(undefined),
}))
```

**`apps/api/test/mocks/mock-r2-client.ts` — intero file da eliminare** (spy su `S3Client.prototype.send`)

**Stato attuale path D1 locale (verificato sul branch):**
```
apps/api/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/<hash>.sqlite
```
Nota: il filename è un **hash deterministico** (es. `fae27b11e77ee172677a2b8632ac825dafca9418f0d0cca40341616042656ce4.sqlite`), **non** `db.sqlite`. La specifica originale che indicava `db.sqlite` è errata — montare l'intera directory e lasciare che `sqlite-web` faccia auto-discover.

---

## 2. Task 1 — Mailpit + provider SMTP

### 2.1 `docker-compose.yml`

Aggiungere sotto `services` (mantenendo `minio` e `minio-init` esistenti):

```yaml
  mailpit:
    image: axllent/mailpit:latest
    container_name: beech-mailpit
    restart: unless-stopped
    ports:
      - "127.0.0.1:1025:1025"   # SMTP (futuro use)
      - "127.0.0.1:8025:8025"   # Web UI + HTTP send/search API
    environment:
      MP_MAX_MESSAGES: 500
      MP_SMTP_AUTH_ACCEPT_ANY: 1
      MP_SMTP_AUTH_ALLOW_INSECURE: 1
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:8025/livez"]
      interval: 5s
      timeout: 3s
      retries: 5
```

### 2.2 Nuovo provider — `apps/api/src/features/email/providers/smtp.ts`

```typescript
/// <reference types="@cloudflare/workers-types" />
import type { EmailProvider } from '../email.provider'
import type { OutboundEmail } from '../email.types'

/**
 * SMTP-via-HTTP email provider that targets a Mailpit instance.
 *
 * Cloudflare Workers do not support raw TCP SMTP from user code (the `connect()`
 * API exists but is overkill for dev tooling). Mailpit exposes a JSON HTTP API
 * (`POST /api/v1/send`) that accepts the same envelope as a normal SMTP message.
 *
 * Use this provider only in development / integration tests. Production keeps
 * ResendEmailProvider.
 *
 * Mailpit send API: https://mailpit.axllent.org/docs/api-v1/Send/
 */
export interface SmtpProviderConfig {
  /** Base URL of the Mailpit HTTP API, e.g. http://localhost:8025 */
  baseUrl: string
}

interface MailpitAddress { Name?: string; Email: string }
interface MailpitSendPayload {
  From: MailpitAddress
  To: MailpitAddress[]
  Subject: string
  HTML?: string
  Text?: string
}

function parseAddress(raw: string): MailpitAddress {
  // Accepts "Name <email@host>" or "email@host"
  const match = raw.match(/^\s*(.+?)\s*<([^>]+)>\s*$/)
  if (match) return { Name: match[1], Email: match[2] }
  return { Email: raw.trim() }
}

export class SmtpEmailProvider implements EmailProvider {
  private readonly endpoint: string

  constructor(config: SmtpProviderConfig) {
    this.endpoint = `${config.baseUrl.replace(/\/$/, '')}/api/v1/send`
  }

  async send(email: OutboundEmail): Promise<void> {
    const payload: MailpitSendPayload = {
      From: parseAddress(email.from),
      To: email.to.map(parseAddress),
      Subject: email.subject,
      HTML: email.html,
    }

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => `HTTP ${response.status}`)
      throw new Error(`[SmtpEmailProvider] send failed — ${body}`)
    }
  }
}
```

### 2.3 Aggiornamento `apps/api/src/features/email/email.service.ts`

Sostituire `createProvider` (L36–38) e aggiungere il selettore.
Le funzioni `sendPasswordResetEmail` / `sendPasswordChangedEmail` / `sendAutomationMail` devono passare a `createProvider` anche il selector e la baseUrl SMTP. Aggiungere a ognuno dei tre tipi in `email.types.ts` i nuovi parametri opzionali, **oppure** (preferito) cambiare la firma di `createProvider` per accettare un oggetto `EmailProviderEnv`:

```typescript
import { SmtpEmailProvider } from './providers/smtp'

export interface EmailProviderEnv {
  /** "smtp" | "resend"; default "resend" */
  provider?: string
  /** Resend API key, used when provider is "resend" */
  apiKey?: string
  /** Mailpit base URL (e.g. http://localhost:8025), used when provider is "smtp" */
  smtpBaseUrl?: string
  isDev?: boolean
}

function createProvider(env: EmailProviderEnv): EmailProvider {
  if (env.provider === 'smtp') {
    if (!env.smtpBaseUrl) throw new Error('SMTP provider selected but SMTP_HOST is missing')
    return new SmtpEmailProvider({ baseUrl: env.smtpBaseUrl })
  }
  return new ResendEmailProvider(env.apiKey ?? '', env.isDev ?? false)
}
```

Aggiornare i call site nello stesso file:
- `sendPasswordResetEmail` / `sendPasswordChangedEmail`: ricevono `params.provider`, `params.smtpBaseUrl` (opzionali) → passati a `createProvider`.
- `sendAutomationMail`: idem.

Aggiornare i tipi in `email.types.ts` aggiungendo a `PasswordResetEmailParams`, `PasswordChangedEmailParams`, `AutomationMailParams`:
```typescript
provider?: 'smtp' | 'resend'
smtpBaseUrl?: string
```

Aggiornare i call site upstream:
- `apps/api/src/features/password-reset/request.ts` L67–74 → aggiungere `provider: env.EMAIL_PROVIDER as 'smtp'|'resend'|undefined`, `smtpBaseUrl: env.SMTP_HOST && env.SMTP_PORT ? \`http://\${env.SMTP_HOST}:\${env.SMTP_PORT}\` : undefined`.
- `apps/api/src/features/password-reset/reset.ts` (cercare l'analoga chiamata a `sendPasswordChangedEmail`).
- `apps/api/src/features/automations/action-executors/send-mail.executor.ts` L31–37 → idem, propagando da `env`.
- Rimuovere il bail-out `if (!env.RESEND_API_KEY)` in `request.ts` L19–21 quando `EMAIL_PROVIDER === 'smtp'` (l'api key non è richiesta per SMTP). Sostituire con:
  ```typescript
  const useSmtp = env.EMAIL_PROVIDER === 'smtp'
  if (!useSmtp && !env.RESEND_API_KEY) {
    return context.json({ error: 'Service not available' }, 503)
  }
  ```
- Stesso refactor nel `send-mail.executor.ts` (il check `if (!apiKey)` deve diventare `if (!useSmtp && !apiKey)`).

### 2.4 `apps/api/src/types.ts`

Aggiungere a `Env`:
```typescript
EMAIL_PROVIDER?: string   // "smtp" | "resend"
SMTP_HOST?: string        // "localhost" in dev
SMTP_PORT?: string        // "8025" in dev (Mailpit HTTP API)
WEBHOOK_TESTER_URL?: string  // "http://localhost:8084" in dev/test
```

### 2.5 `apps/api/.dev.vars.example`

Appendere:
```
# --- Email (Sprint 03) ---
# In dev usa Mailpit. In prod (wrangler secret) imposta EMAIL_PROVIDER=resend e RESEND_API_KEY.
EMAIL_PROVIDER=smtp
SMTP_HOST=localhost
SMTP_PORT=8025
EMAIL_FROM=Beech CMS <dev@beech.local>

# --- Webhook tester (Sprint 03, solo dev/test) ---
WEBHOOK_TESTER_URL=http://localhost:8084
```

### 2.6 `apps/api/wrangler.jsonc`

Aggiornare il blocco `vars` aggiungendo:
```jsonc
"EMAIL_PROVIDER": "smtp",
"SMTP_HOST": "localhost",
"SMTP_PORT": "8025",
"EMAIL_FROM": "Beech CMS <dev@beech.local>",
"WEBHOOK_TESTER_URL": "http://localhost:8084"
```
Aggiornare il commento prod (L83–84):
```
// In prod: wrangler secret put EMAIL_PROVIDER (resend), RESEND_API_KEY, APP_URL, EMAIL_FROM.
// In dev locale: EMAIL_PROVIDER=smtp punta Mailpit su localhost:8025.
```

### 2.7 Accettazione

- Avviando `pnpm run dev:full`, una richiesta `POST /auth/forgot-password` deposita una email **visibile** in `http://localhost:8025` con i link reali funzionanti.
- Grep `RESEND_API_KEY` in `apps/api/src/features/password-reset/`: ogni uso è gated da `EMAIL_PROVIDER !== 'smtp'`.
- Test `email-smtp.integration.test.ts` (Task 4.2) verde con Mailpit attivo.
- `pnpm run build -w apps/api` compila pulito.

---

## 3. Task 2 — SQLite Web per ispezione D1 locale

### 3.1 `docker-compose.yml`

```yaml
  sqlite-web:
    image: coleifer/sqlite-web:latest
    container_name: beech-sqlite-web
    restart: unless-stopped
    ports:
      - "127.0.0.1:8080:8080"
    volumes:
      - ./apps/api/.wrangler/state/v3/d1/miniflare-D1DatabaseObject:/data:ro
    working_dir: /data
    # Lascia che il container risolva il primo .sqlite presente. Wrangler nomina
    # il file con un hash deterministico (es. fae27b...sqlite), non "db.sqlite".
    entrypoint: ["sh", "-c"]
    command:
      - >
        DB_FILE=$$(ls /data/*.sqlite 2>/dev/null | grep -v metadata | head -n 1);
        if [ -z "$$DB_FILE" ]; then
          echo "[sqlite-web] No D1 database found. Run 'pnpm run db:migrate:local' first." >&2;
          sleep infinity;
        fi;
        echo "[sqlite-web] Serving $$DB_FILE";
        sqlite_web -H 0.0.0.0 -p 8080 --read-only "$$DB_FILE"
    depends_on:
      minio:
        condition: service_started
```

> **Read-only di default** — il viewer è uno strumento di ispezione, non un editor. Per modificare il DB si usano `wrangler d1 execute --local` o migrazioni.
> Il bind `127.0.0.1:8080` evita esposizione su rete (il DB contiene hash password e token reset).

### 3.2 Accettazione

- `http://localhost:8080` mostra le tabelle Beech (`users`, `sessions`, `content_*`, `media_objects`, `activity_logs`, ...).
- Se l'utente non ha ancora applicato le migrazioni, il container logga un messaggio chiaro (non crasha in loop).
- Documentato in `docs/development.md` §Strumenti di Sviluppo Docker.

---

## 4. Task 3 — Webhook tester locale + Cloudflared Quick Tunnel

### 4.1 `docker-compose.yml`

```yaml
  webhook-tester:
    image: tarampampam/webhook-tester:latest
    container_name: beech-webhook-tester
    restart: unless-stopped
    ports:
      - "127.0.0.1:8084:8080"
    command: ["serve", "--port", "8080"]
    healthcheck:
      test: ["CMD-SHELL", "wget -q --spider http://localhost:8080/api/ready || exit 1"]
      interval: 5s
      timeout: 3s
      retries: 5

  tunnel:
    image: cloudflare/cloudflared:latest
    container_name: beech-tunnel
    restart: unless-stopped
    # Quick Tunnel: nessun account, URL effimera *.trycloudflare.com letta dai log
    command: tunnel --no-autoupdate --url http://host.docker.internal:8787
    # Su Linux abilitare host.docker.internal:
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

### 4.2 Uso

- **Dentro Beech (test e dev quotidiano)**: gli action webhook puntano a `${WEBHOOK_TESTER_URL}/<uuid>` invece di a `webhook.site/<uuid>`. Lo sviluppatore crea il "session UUID" via `POST http://localhost:8084/api/session` (o passando un UUID arbitrario; webhook-tester accetta path arbitrari come bucket).
- **Per webhook entranti da terzi (Stripe, GitHub, ...)**: lo sviluppatore recupera la URL trycloudflare dai log del container `tunnel` e la registra come endpoint pubblico nel servizio di terze parti. Lo script `pnpm run dev:tunnel-url` la estrae.

### 4.3 Accettazione

- `docker compose logs tunnel` mostra una URL `https://<random>.trycloudflare.com`.
- `pnpm run dev:tunnel-url` stampa solo la URL.
- Test `action-executors.test.ts` (Task 4.4) verde con assertion reali contro `webhook-tester`.

---

## 5. Task 4 — Migrazione dei test da mock a container reali

### 5.1 Precheck Docker — fail-fast prima di qualsiasi test

**Principio:** appena parte `pnpm test` (su qualsiasi workspace che integra con servizi esterni), la **primissima cosa** che deve succedere è verificare che lo stack Docker sia attivo e raggiungibile. Se uno solo dei servizi richiesti non risponde, l'intera suite si ferma con un messaggio actionable in cima al log — niente test eseguiti, niente errori opachi tipo "ECONNREFUSED 127.0.0.1:9000" sparsi nei singoli test.

Questa logica vive in **un solo posto** (`test/docker-precheck.ts`), riusabile da:
- `apps/api/test/global-setup.ts` (vitest globalSetup → blocca tutta la suite API).
- Qualsiasi futuro workspace che vorrà eseguire test di integrazione contro i container.

#### 5.1.a `apps/api/test/docker-precheck.ts` (nuovo, riusabile)

```typescript
/**
 * Docker stack precheck — verifies that all containers required by the Beech
 * integration tests are running and healthy.
 *
 * Throws a single, well-formatted error listing ALL unreachable services
 * (not just the first one) so the developer fixes everything in one shot.
 */
export interface RequiredService {
  name: string
  url: string
  containerName: string
}

export const REQUIRED_SERVICES: RequiredService[] = [
  { name: 'MinIO',          url: 'http://localhost:9000/minio/health/live', containerName: 'beech-minio' },
  { name: 'Mailpit',        url: 'http://localhost:8025/livez',             containerName: 'beech-mailpit' },
  { name: 'webhook-tester', url: 'http://localhost:8084/api/ready',         containerName: 'beech-webhook-tester' },
]

interface CheckResult { service: RequiredService; ok: boolean; reason?: string }

async function checkOne(svc: RequiredService, timeoutMs = 2000): Promise<CheckResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(svc.url, { signal: controller.signal })
    return res.ok ? { service: svc, ok: true } : { service: svc, ok: false, reason: `HTTP ${res.status}` }
  } catch (err) {
    return { service: svc, ok: false, reason: err instanceof Error ? err.message : String(err) }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Runs all checks in parallel. Throws a single aggregated Error if any check fails.
 * Returns silently on success.
 */
export async function assertDockerStackReady(): Promise<void> {
  const results = await Promise.all(REQUIRED_SERVICES.map(s => checkOne(s)))
  const failed = results.filter(r => !r.ok)
  if (failed.length === 0) return

  const lines: string[] = [
    '',
    '═══════════════════════════════════════════════════════════════════════',
    '  ❌  Beech test suite cannot start — Docker stack is not ready.',
    '═══════════════════════════════════════════════════════════════════════',
    '',
    `  Services unreachable (${failed.length}/${REQUIRED_SERVICES.length}):`,
    ...failed.map(f => `    • ${f.service.name.padEnd(16)} ${f.service.url}   → ${f.reason}`),
    '',
    '  Beech requires the full Docker stack for integration tests.',
    '  No mocks, no fallbacks: the same containers used in `pnpm run dev:full`.',
    '',
    '  Fix:',
    '    1) pnpm run dev:full           # from repo root — starts the whole stack',
    '       (or, if the stack is already up, check `docker ps` for the container names',
    `        ${REQUIRED_SERVICES.map(s => s.containerName).join(', ')})`,
    '    2) Re-run the tests.',
    '',
    '═══════════════════════════════════════════════════════════════════════',
    '',
  ]
  throw new Error(lines.join('\n'))
}
```

#### 5.1.b `apps/api/test/global-setup.ts` (nuovo)

```typescript
/**
 * Vitest global setup — runs once before all tests.
 * 1. Verifies the Docker stack is reachable (fail-fast precheck).
 * 2. Creates an ephemeral MinIO bucket for the run.
 * 3. Returns a teardown that drops the bucket.
 */
import { S3Client, CreateBucketCommand, DeleteBucketCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { assertDockerStackReady } from './docker-precheck'

const TEST_BUCKET = process.env.BEECH_TEST_BUCKET ?? `beech-media-test-${process.pid}`

export async function setup() {
  // ── 1. Precheck Docker (throws with a formatted error if any service is down) ──
  await assertDockerStackReady()

  // ── 2. Ephemeral MinIO bucket ──────────────────────────────────────────────────
  const s3 = new S3Client({
    region: 'auto',
    endpoint: 'http://localhost:9000',
    credentials: { accessKeyId: 'beechdev', secretAccessKey: 'beechdevsecret' },
    forcePathStyle: true,
  })
  await s3.send(new CreateBucketCommand({ Bucket: TEST_BUCKET })).catch(() => { /* exists */ })
  process.env.BEECH_TEST_BUCKET = TEST_BUCKET

  return async () => {
    const list = await s3.send(new ListObjectsV2Command({ Bucket: TEST_BUCKET }))
    for (const obj of list.Contents ?? []) {
      if (obj.Key) await s3.send(new DeleteObjectCommand({ Bucket: TEST_BUCKET, Key: obj.Key }))
    }
    await s3.send(new DeleteBucketCommand({ Bucket: TEST_BUCKET })).catch(() => {})
  }
}
```

#### 5.1.c Vitest config (`apps/api/vitest.config.ts`)

Registrare `globalSetup` **come primissimo elemento**:
```typescript
test: {
  globalSetup: ['./test/docker-precheck.runner.ts', './test/global-setup.ts'],
  // ...
}
```

> **Nota:** vitest esegue i `globalSetup` in ordine. Volutamente li teniamo separati: `docker-precheck.runner.ts` (sotto) blocca subito se Docker manca, **prima** che `global-setup.ts` tenti di creare il bucket (che fallirebbe con un errore meno chiaro). Questo separa "validazione precondizioni" da "predisposizione fixture".

#### 5.1.d `apps/api/test/docker-precheck.runner.ts` (nuovo)

```typescript
/** Vitest globalSetup wrapper: runs the Docker precheck and exits early on failure. */
import { assertDockerStackReady } from './docker-precheck'
export async function setup() { await assertDockerStackReady() }
```

> Sì, il precheck viene fatto due volte (qui e dentro `global-setup.ts`). Vantaggio: se in futuro qualcuno aggiunge un altro `globalSetup` prima di `global-setup.ts`, la garanzia "Docker è up" resta valida. È idempotente e costa ~30ms.

#### 5.1.e Esempio di output su failure

```
═══════════════════════════════════════════════════════════════════════
  ❌  Beech test suite cannot start — Docker stack is not ready.
═══════════════════════════════════════════════════════════════════════

  Services unreachable (2/3):
    • Mailpit          http://localhost:8025/livez   → fetch failed
    • webhook-tester   http://localhost:8084/api/ready   → fetch failed

  Beech requires the full Docker stack for integration tests.
  No mocks, no fallbacks: the same containers used in `pnpm run dev:full`.

  Fix:
    1) pnpm run dev:full           # from repo root — starts the whole stack
       (or, if the stack is already up, check `docker ps` for the container names
        beech-minio, beech-mailpit, beech-webhook-tester)
    2) Re-run the tests.

═══════════════════════════════════════════════════════════════════════
```

#### 5.1.f Test puramente unitari

Alcuni file (`apps/api/test/email-types.test.ts`, `core-validation.test.ts`, `query-utils.test.ts`, `media-utils.test.ts`) testano funzioni pure e non toccano Docker. Vitest non offre un "globalSetup condizionale per file" — il precheck quindi gira **una volta sola per intero run**, anche se la suite contiene solo test puri. Costo: ~30ms per richiesta `fetch` × 3 servizi in parallelo ≈ ~50ms totali. Trascurabile. **Non implementare** opt-out per file: la coerenza vale più del risparmio.

---

### 5.1.bis — Sostituzione `MockD1Database` con SQLite reale (better-sqlite3)

**Principio:** lo stesso ragionamento applicato a R2/email/webhook vale per D1. `MockD1Database` è un emulatore hand-rolled che fa string-matching su SQL normalizzato (`if (sql.includes('FROM users WHERE email = ?'))`); ogni nuova query aggiunge un `if`. È fragile, divergente dalla semantica reale di D1 (FTS5, transazioni, foreign keys, integer affinity, ON CONFLICT) e ha già accumulato decine di branch ad-hoc. D1 in produzione è SQLite; possiamo usare SQLite reale anche nei test senza container, perché è un binding in-process Node.

**Scelta tecnologica:** `better-sqlite3` (sync API, performance superiore, transactional helpers, supporto FTS5 nativo). Wrangler stesso usa SQLite via miniflare → identico runtime.

**Perché in-process e non un container SQLite:** ogni test deve partire da DB pulito e isolato. Un file `.sqlite` condiviso fra worker vitest paralleli sarebbe un disastro. `better-sqlite3` con `':memory:'` (oppure file temp per-PID) dà isolamento perfetto a costo zero.

#### 5.1.bis.a Nuova classe `apps/api/test/helpers/d1-test-database.ts`

```typescript
/**
 * Real SQLite-backed D1Database implementation for tests.
 *
 * Wraps better-sqlite3 to expose Cloudflare's D1Database interface
 * (prepare → bind/first/all/run/raw, exec, batch). Behavior matches what
 * the Worker actually sees in production, eliminating the drift between
 * tests and live D1 that the previous string-matching MockD1Database had.
 *
 * Each instance creates its own in-memory database. Tests should create
 * a fresh instance in `beforeEach` for full isolation.
 */
import Database from 'better-sqlite3'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { D1Database, D1PreparedStatement, D1Result, D1ExecResult } from '@cloudflare/workers-types'

const MIGRATIONS_DIR = join(__dirname, '../../migrations')

export interface D1TestDatabaseOptions {
  /** Apply all `migrations/*.sql` files in order before returning. Default: true. */
  applyMigrations?: boolean
  /** Optional list of additional SQL statements to run (e.g. seed fixtures). */
  seedSql?: string[]
}

export class D1TestDatabase implements D1Database {
  private readonly db: Database.Database

  constructor(opts: D1TestDatabaseOptions = {}) {
    this.db = new Database(':memory:')
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')

    if (opts.applyMigrations !== false) {
      const files = readdirSync(MIGRATIONS_DIR)
        .filter(f => /^\d{4}_.+\.sql$/.test(f))
        .sort()
      for (const f of files) {
        const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8')
        this.db.exec(sql)
      }
    }
    for (const sql of opts.seedSql ?? []) this.db.exec(sql)
  }

  prepare(query: string): D1PreparedStatement {
    return new D1TestStatement(this.db, query, [])
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    return this.db.transaction(() => {
      return Promise.all(statements.map(s => (s as any).all()))
    })() as unknown as D1Result<T>[]
  }

  async exec(query: string): Promise<D1ExecResult> {
    const start = performance.now()
    this.db.exec(query)
    return { count: query.split(';').filter(s => s.trim()).length, duration: performance.now() - start }
  }

  dump(): Promise<ArrayBuffer> { throw new Error('dump() not implemented in tests') }
  withSession(): D1Database { return this }

  /** Test helper: close the underlying connection. Call in afterEach if needed. */
  close(): void { this.db.close() }
}

class D1TestStatement implements D1PreparedStatement {
  constructor(private db: Database.Database, private sql: string, private params: unknown[]) {}

  bind(...values: unknown[]): D1PreparedStatement {
    return new D1TestStatement(this.db, this.sql, values)
  }

  async first<T = unknown>(colName?: string): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.params) as Record<string, unknown> | undefined
    if (!row) return null
    return (colName ? row[colName] : row) as T
  }

  async all<T = unknown>(): Promise<D1Result<T>> {
    const start = performance.now()
    const results = this.db.prepare(this.sql).all(...this.params) as T[]
    return {
      results,
      success: true,
      meta: { duration: performance.now() - start, served_by: 'd1-test', changes: 0, last_row_id: 0, rows_read: results.length, rows_written: 0, size_after: 0 },
    }
  }

  async run<T = unknown>(): Promise<D1Result<T>> {
    const start = performance.now()
    const info = this.db.prepare(this.sql).run(...this.params)
    return {
      results: [] as T[],
      success: true,
      meta: { duration: performance.now() - start, served_by: 'd1-test', changes: info.changes, last_row_id: Number(info.lastInsertRowid), rows_read: 0, rows_written: info.changes, size_after: 0 },
    }
  }

  async raw<T = unknown>(): Promise<T[]> {
    return this.db.prepare(this.sql).raw().all(...this.params) as T[]
  }
}
```

#### 5.1.bis.b Migrazione dei test esistenti

Tutti i 6 file flow che usano `MockD1Database` (`flow-admin-auth`, `flow-content-management`, `flow-draft-management`, `flow-media-assets`, `flow-stats`, `flow-system-schema`) devono passare a `D1TestDatabase`. Esempio:

```diff
- import { MockD1Database } from './mocks/mock-d1-database'
+ import { D1TestDatabase } from './helpers/d1-test-database'

  beforeEach(() => {
-   db = new MockD1Database({ users: TEST_USERS })
+   db = new D1TestDatabase()
+   // Seed users via real SQL (no more in-memory arrays)
+   for (const u of TEST_USERS) {
+     db.prepare('INSERT INTO users (id, email, password_hash, role, name) VALUES (?, ?, ?, ?, ?)')
+       .bind(u.id, u.email, u.password_hash, u.role, u.name).run()
+   }
  })
```

Per fixture utenti riusabili, creare `apps/api/test/helpers/seed-fixtures.ts` con `seedTestUsers(db, TEST_USERS)` che incapsula gli `INSERT`. Mantenere `TEST_USERS` in `fixtures.ts` come oggetti TypeScript.

#### 5.1.bis.c File da eliminare

- `apps/api/test/mocks/mock-d1-database.ts` → **rimosso** dopo migrazione di tutti i call site.
- `apps/api/test/mocks/static-content.repository.ts` e `static-idempotency.repository.ts` → **valutare** se ancora utili. Con D1 reale i `D1ContentRepository` / `D1IdempotencyRepository` di produzione funzionano senza modifiche → preferibile usare quelli reali nei test e cancellare anche queste implementazioni statiche.

#### 5.1.bis.d Dipendenze

Aggiungere a `apps/api/package.json` (dev):
```jsonc
"devDependencies": {
  "better-sqlite3": "^11.3.0",
  "@types/better-sqlite3": "^7.6.11"
}
```

> **Nota build:** `better-sqlite3` è un binding nativo (richiede compilazione). Su Windows serve `windows-build-tools` o Visual Studio Build Tools (la macchina dev attuale è Windows 11; verificare durante l'implementazione). In CI Linux è una `pnpm install` standard.

#### 5.1.bis.e Compatibilità con migrazioni

Le migrazioni Beech usano FTS5 (`fts_{slug}`) e trigger. `better-sqlite3` v11 supporta FTS5 di default (compilato con `SQLITE_ENABLE_FTS5`). Verificare durante l'implementazione con un test che esegue una query FTS contro `D1TestDatabase`. Se mancasse, ricompilare con il flag o usare `better-sqlite3-fts5` (fork).

#### 5.1.bis.f Accettazione

- Grep `MockD1Database` su `apps/api`: zero match.
- File `apps/api/test/mocks/mock-d1-database.ts` non esiste.
- `pnpm test -w apps/api` verde, suite più veloce o uguale (better-sqlite3 sync è più rapido degli `await` finti del mock).
- Un test deliberatamente patologico per il vecchio mock (es. `JOIN` complesso fra `content_posts` e `media_objects` con FTS5 MATCH) ora passa contro `D1TestDatabase`.
- Coverage `apps/api/test/helpers/d1-test-database.ts` non incluso nei threshold (è codice di test, non di prod).

### 5.2 `apps/api/vitest.config.ts` — aggiungere

```typescript
globalSetup: ['./test/global-setup.ts'],
```
(dentro `test:`)

Aggiornare anche `coverage.exclude`: aggiungere `'src/features/email/providers/smtp.ts'` se vogliamo escluderlo dal threshold (il provider Resend è già escluso), oppure includerlo (verrà coperto dal test SMTP di integrazione).

### 5.3 `apps/api/test/fixtures.ts` — `TEST_ENV` deve includere

```typescript
EMAIL_PROVIDER: 'smtp',
SMTP_HOST: 'localhost',
SMTP_PORT: '8025',
EMAIL_FROM: 'Test <test@beech.local>',
WEBHOOK_TESTER_URL: 'http://localhost:8084',
R2_ENDPOINT: 'http://localhost:9000',
R2_ACCESS_KEY_ID: 'beechdev',
R2_SECRET_ACCESS_KEY: 'beechdevsecret',
R2_BUCKET_NAME: process.env.BEECH_TEST_BUCKET ?? 'beech-media-test',
```

### 5.4 Helper `apps/api/test/helpers/mailpit-client.ts` (nuovo)

```typescript
const BASE = 'http://localhost:8025'

export interface MailpitMessage {
  ID: string
  From: { Address: string; Name: string }
  To: Array<{ Address: string; Name: string }>
  Subject: string
  Snippet: string
}

export async function deleteAllMessages(): Promise<void> {
  await fetch(`${BASE}/api/v1/messages`, { method: 'DELETE' })
}

export async function listMessages(): Promise<MailpitMessage[]> {
  const res = await fetch(`${BASE}/api/v1/messages`)
  if (!res.ok) throw new Error(`Mailpit list failed: ${res.status}`)
  const json = await res.json() as { messages: MailpitMessage[] }
  return json.messages
}

export async function getMessageHtml(id: string): Promise<string> {
  const res = await fetch(`${BASE}/api/v1/message/${id}`)
  if (!res.ok) throw new Error(`Mailpit get failed: ${res.status}`)
  const json = await res.json() as { HTML: string }
  return json.HTML
}

export async function waitForMessage(predicate: (m: MailpitMessage) => boolean, timeoutMs = 3000): Promise<MailpitMessage> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const msgs = await listMessages()
    const match = msgs.find(predicate)
    if (match) return match
    await new Promise(r => setTimeout(r, 100))
  }
  throw new Error('Timed out waiting for Mailpit message')
}
```

### 5.5 Helper `apps/api/test/helpers/webhook-tester-client.ts` (nuovo)

```typescript
const BASE = process.env.WEBHOOK_TESTER_URL ?? 'http://localhost:8084'

export interface WebhookTesterRequest {
  uuid: string
  method: string
  headers: Record<string, string>
  body: string
  created_at_unix: number
}

/** Generates an ephemeral bucket URL. Tests POST to `${url}` and then read via `getRequests(uuid)`. */
export function newBucket(): { url: string; uuid: string } {
  const uuid = crypto.randomUUID()
  return { url: `${BASE}/${uuid}`, uuid }
}

export async function getRequests(uuid: string): Promise<WebhookTesterRequest[]> {
  const res = await fetch(`${BASE}/api/session/${uuid}/requests`)
  if (!res.ok) return []
  return await res.json() as WebhookTesterRequest[]
}

export async function waitForRequest(uuid: string, timeoutMs = 3000): Promise<WebhookTesterRequest> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const reqs = await getRequests(uuid)
    if (reqs.length > 0) return reqs[0]
    await new Promise(r => setTimeout(r, 100))
  }
  throw new Error('Timed out waiting for webhook delivery')
}
```

> Nota: l'API esatta di `tarampampam/webhook-tester` (`/api/session/...`) va verificata con `curl http://localhost:8084/api/...` durante l'implementazione e adattata. Se incompatibile, alternativa equivalente: `mendhak/http-https-echo` con un piccolo wrapper che logga in stdout (read via `docker logs`).

### 5.6 Riscrittura `apps/api/test/flow-media-assets.test.ts`

- **Eliminare** i blocchi `vi.hoisted` e `vi.mock('@aws-sdk/...')` (L8–24).
- **Eliminare** `mockS3Send` e `mockGetSignedUrl` dovunque vengano usati.
- Sostituire le aspettative tipo `expect(mockS3Send).toHaveBeenCalled()` con verifica reale: dopo `POST /api/upload/presign` + `PUT` reale verso la URL firmata + `POST /api/upload/confirm`, assertare che il bucket di test contenga l'oggetto via `HeadObjectCommand` reale.
- Ogni test deve generare key univoche (es. prefisso `test-${nanoid}-`) per isolation.
- `beforeEach` deve pulire i log Mailpit (`deleteAllMessages()`) se il flow usa email.

### 5.7 `apps/api/test/mocks/mock-r2-client.ts`

**Eliminare il file.** Aggiornare imports orfani con grep `mock-r2-client`.

### 5.8 Riscrittura `apps/api/src/features/automations/__tests__/action-executors.test.ts`

- **Rimuovere** `vi.mock('../../email', () => ({ sendAutomationMail: vi.fn() }))` (L99–101).
- I test `send_mail` ora devono:
  1. `await deleteAllMessages()` in `beforeEach`.
  2. Eseguire `executeAction(...)` con `env` reale (`EMAIL_PROVIDER: 'smtp'`, `SMTP_HOST: 'localhost'`, `SMTP_PORT: '8025'`).
  3. `const msg = await waitForMessage(m => m.To.some(t => t.Address === 'user@example.com'))`.
  4. `expect(msg.Subject).toBe('Re: Hello')` e `expect(await getMessageHtml(msg.ID)).toContain('Your entry Hello')`.
- I test `webhook` ora devono:
  1. `const { url, uuid } = newBucket()`.
  2. `await executeAction({ type: 'webhook', url, body_template: '...' }, ctx)`.
  3. `const req = await waitForRequest(uuid)`.
  4. `expect(req.method).toBe('POST')` e `expect(JSON.parse(req.body)).toMatchObject({...})`.
- I test che oggi verificano "skipped quando apiKey manca" devono diventare "skipped quando provider=resend e apiKey manca". Aggiungere un test parallelo "con provider=smtp non serve apiKey".

### 5.9 Test di integrazione SMTP — `apps/api/test/email-smtp.integration.test.ts` (nuovo)

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { SmtpEmailProvider } from '../src/features/email/providers/smtp'
import { deleteAllMessages, waitForMessage, getMessageHtml } from './helpers/mailpit-client'

describe('SmtpEmailProvider (integration with Mailpit)', () => {
  beforeEach(() => deleteAllMessages())

  it('delivers an HTML email to Mailpit', async () => {
    const provider = new SmtpEmailProvider({ baseUrl: 'http://localhost:8025' })
    await provider.send({
      from: 'Test <noreply@beech.local>',
      to: ['alice@example.com'],
      subject: 'Hello from Beech',
      html: '<p>This is a <strong>test</strong></p>',
    })
    const msg = await waitForMessage(m => m.Subject === 'Hello from Beech')
    expect(msg.To[0].Address).toBe('alice@example.com')
    const html = await getMessageHtml(msg.ID)
    expect(html).toContain('<strong>test</strong>')
  })

  it('throws on Mailpit error', async () => {
    const provider = new SmtpEmailProvider({ baseUrl: 'http://localhost:8025' })
    await expect(provider.send({
      from: '', to: [], subject: '', html: '',
    })).rejects.toThrow(/SmtpEmailProvider/)
  })
})
```

### 5.10 Accettazione test

- `cd apps/api && pnpm test` esegue tutti i test con Docker attivo, **zero `vi.mock` su `@aws-sdk/*` o `'../../email'`**.
- Grep `vi\.mock\(['"]\@aws-sdk` in `apps/api`: zero match.
- Grep `vi\.mock\(['"]\.\./\.\./email` in `apps/api`: zero match.
- Grep `webhook.site` in tutto il repo: zero match (solo in `CHANGELOG.md` se necessario).
- File `test/mocks/mock-r2-client.ts` non esiste più.
- Se Docker è spento, `pnpm test` fallisce con il messaggio actionable di `global-setup.ts`.

---

## 6. Task 5 — Script `package.json` (root)

Aggiungere agli `scripts`:

**Eliminare** dal `package.json` esistente: `dev:storage`, `dev:storage:stop`, `dev:storage:reset`. Beech non supporta più uno stack parziale.

```jsonc
{
  "scripts": {
    "dev": "docker compose up -d && turbo run dev --parallel",
    "dev:full": "docker compose up -d && turbo run dev --parallel",
    "dev:tunnel-url": "docker compose logs tunnel 2>&1 | grep -Eo 'https://[a-z0-9-]+\\.trycloudflare\\.com' | tail -n 1",
    "dev:logs:mailpit": "docker compose logs -f mailpit",
    "dev:logs:sqlite": "docker compose logs -f sqlite-web",
    "dev:logs:tunnel": "docker compose logs -f tunnel",
    "dev:logs:minio": "docker compose logs -f minio",
    "dev:mailpit:reset": "curl -X DELETE http://localhost:8025/api/v1/messages",
    "dev:stop": "docker compose stop",
    "dev:reset": "docker compose down -v"
  }
}
```

`dev` e `dev:full` sono **lo stesso comando** (alias): un solo modo di avviare l'ambiente. `dev:full` resta come nome canonico documentato, `dev` esiste per memoria muscolare. Nessuno script lancia `turbo dev` senza prima portare su lo stack Docker — non vogliamo che esista la possibilità di girare l'API senza i suoi servizi di supporto.

---

## 6.bis Task 5.bis — Bootstrap automatico del database D1 locale

**Principio:** la prima volta che uno sviluppatore esegue `pnpm run dev:full` su un clone fresco, deve trovarsi un database funzionante senza dover ricordare comandi `db:migrate`. Beech rileva l'assenza del DB e applica migrazioni + seed di base in modo idempotente.

### 6.bis.1 Path canonico del DB locale

Wrangler crea il file SQLite sotto:
```
apps/api/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/<hash>.sqlite
```

Il nome è un hash deterministico generato da Wrangler la prima volta che il binding viene usato. Considerare "DB presente" se esiste almeno un file `*.sqlite` (escluso `metadata.sqlite`) **e** contiene la tabella `users` (sentinella della migrazione `0000_v040_base.sql`).

### 6.bis.2 Nuovo script `apps/api/scripts/bootstrap-d1.mjs`

```javascript
#!/usr/bin/env node
/**
 * Idempotent D1 bootstrap for local dev.
 *
 * Runs every time `pnpm run dev:full` starts. Detects whether the local
 * D1 database exists and contains the base schema; if not, applies migrations
 * 0000 → latest in order and loads the base seed data.
 *
 * Safe to run repeatedly: a fully-migrated DB is a no-op.
 */
import { existsSync, readdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const API_DIR = join(__dirname, '..')
const D1_DIR  = join(API_DIR, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject')
const MIGRATIONS_DIR = join(API_DIR, 'migrations')

function hasSqliteFile() {
  if (!existsSync(D1_DIR)) return false
  return readdirSync(D1_DIR).some(f => f.endsWith('.sqlite') && !f.startsWith('metadata'))
}

function hasBaseSchema() {
  try {
    const out = execSync(
      `npx wrangler d1 execute beech-db --local --command "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"`,
      { cwd: API_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    )
    return out.includes('users')
  } catch { return false }
}

function applyMigrationsInOrder() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter(f => /^\d{4}_.+\.sql$/.test(f))
    .sort()
  for (const f of files) {
    console.log(`[bootstrap-d1] applying ${f}`)
    execSync(
      `npx wrangler d1 execute beech-db --local --file=./migrations/${f}`,
      { cwd: API_DIR, stdio: 'inherit' }
    )
  }
}

if (hasSqliteFile() && hasBaseSchema()) {
  console.log('[bootstrap-d1] DB already initialized — skipping.')
  process.exit(0)
}

console.log('[bootstrap-d1] local D1 not initialized — applying migrations…')
applyMigrationsInOrder()
console.log('[bootstrap-d1] done.')
```

> **Idempotenza**: gli script di migrazione devono usare `CREATE TABLE IF NOT EXISTS` / `INSERT OR IGNORE` per i record seed (vedi `0028_v040_seed_data.sql` e `0030_test_seeds.sql`). Verificare e, se necessario, patchare le migrazioni che falliscono se rieseguite.

### 6.bis.3 Integrazione in `package.json` (root)

Modificare `dev:full` (e quindi `dev`) per invocare il bootstrap **dopo** lo start dei container e **prima** di `turbo dev`:

```jsonc
{
  "scripts": {
    "dev": "docker compose up -d && node apps/api/scripts/bootstrap-d1.mjs && turbo run dev --parallel",
    "dev:full": "docker compose up -d && node apps/api/scripts/bootstrap-d1.mjs && turbo run dev --parallel"
  }
}
```

Aggiornare anche gli script in `apps/api/package.json`:
- Sostituire `db:migrate:local` con: `"db:migrate:local": "node ./scripts/bootstrap-d1.mjs"` (single source of truth: lo stesso script usato da `dev:full`).
- Mantenere `db:reset:local` ma riscriverlo come:
  ```jsonc
  "db:reset:local": "node -e \"require('fs').rmSync('.wrangler/state', {recursive:true,force:true})\" && node ./scripts/bootstrap-d1.mjs"
  ```

### 6.bis.4 Test e DB di test

Il `test/global-setup.ts` (Task 5.1) deve anche eseguire il bootstrap prima dei test, **a meno che** i test usino già un `MockD1Database` in-memory (verificato: `apps/api/test/mocks/mock-d1-database.ts` esiste ed è usato dai flow test). Decisione:
- I test **continuano** a usare `MockD1Database` in memoria perché ogni test deve partire da uno stato pulito e prevedibile (impossibile con un file `.sqlite` condiviso fra processi vitest).
- Lo Sprint 03 sostituisce solo i mock dei layer di **integrazione esterna** (R2 → MinIO reale, email → Mailpit reale, webhook → webhook-tester reale). Il DB resta in-memory per i test, perché D1 è una dipendenza interna ben definita e il `MockD1Database` è una sua implementazione corretta (non un mock di comodo).
- Aggiungere una nota esplicita in `docs/development.md` §Testing che chiarisca questa distinzione.

### 6.bis.5 Accettazione

- Su un clone fresco: `git clone … && cd … && pnpm install && pnpm run dev:full` produce un ambiente funzionante senza ulteriori comandi (DB popolato, MinIO + Mailpit + sqlite-web + webhook-tester + tunnel attivi, API + Dashboard partono).
- Il secondo `pnpm run dev:full` non riapplica le migrazioni (`bootstrap-d1` esce con "DB already initialized — skipping").
- Dopo `pnpm run dev:reset` (che fa `docker compose down -v` ma **non** tocca `.wrangler/state`), un successivo `pnpm run dev:full` riprende lo stesso DB.
- Per ripartire da zero anche sul DB: `cd apps/api && pnpm run db:reset:local && cd ../.. && pnpm run dev:full`.
- Nessuno script lancia `wrangler d1 execute --file=...` direttamente da `package.json` (root o api): la sequenza esatta delle migrazioni vive **solo** in `bootstrap-d1.mjs`.

---

## 7. Task 6 — Bootstrap warning multi-servizio

Estendere `apps/api/src/index.ts` L29–37:

```typescript
if (env.ENV === 'development') {
  const checks: Array<{ name: string; url: string }> = [
    { name: 'MinIO',   url: (env.R2_ENDPOINT ?? 'http://localhost:9000') + '/minio/health/live' },
    { name: 'Mailpit', url: `http://${env.SMTP_HOST ?? 'localhost'}:${env.SMTP_PORT ?? '8025'}/livez` },
  ]
  for (const c of checks) {
    fetch(c.url).catch(() => {
      console.warn(
        `\n⚠️  ${c.name} non raggiungibile su ${c.url}\n` +
        `   Beech in dev richiede lo stack Docker completo.\n` +
        `   Avvialo con: pnpm run dev:full\n`
      )
    })
  }
}
```

---

## 8. Task 7 — Documentazione

### 8.1 `docs/development.md`

Aggiungere/sostituire la sezione "Storage in Development" con una sezione più ampia "Strumenti di Sviluppo Docker":

```markdown
## Strumenti di Sviluppo Docker

`pnpm run dev:full` orchestra l'intero stack locale:

| Servizio | Porta host | URL / Console | Scopo |
|---|---|---|---|
| MinIO (S3) | 9000 / 9001 | http://localhost:9001 (`beechdev` / `beechdevsecret`) | Storage R2-compatibile per upload presigned |
| Mailpit | 1025 (SMTP) / 8025 (HTTP) | http://localhost:8025 | Inbox locale per email transazionali (reset password, automation `send_mail`) |
| SQLite Web | 8080 | http://localhost:8080 | Ispezione read-only del database D1 locale |
| webhook-tester | 8084 | http://localhost:8084 | Endpoint locale per testare automation `webhook` |
| Cloudflared Tunnel | n/a | URL `*.trycloudflare.com` da `pnpm run dev:tunnel-url` | Esporre l'API locale a internet per webhook in ingresso da terzi |

### Comandi

Beech ha **un solo modo** di avviare l'ambiente di sviluppo: `pnpm run dev:full`. Non esiste una modalità "senza Docker" né uno stack parziale. Docker è prerequisito non negoziabile.

| Comando | Effetto |
|---|---|
| `pnpm run dev:full` | Avvia stack Docker completo + API + Dashboard (comando canonico) |
| `pnpm run dev` | Alias di `dev:full` |
| `pnpm run dev:tunnel-url` | Stampa la URL pubblica del tunnel Cloudflare |
| `pnpm run dev:mailpit:reset` | Svuota la inbox Mailpit |
| `pnpm run dev:logs:<servizio>` | Stream dei log (mailpit \| sqlite \| tunnel \| minio) |
| `pnpm run dev:stop` | Stop di tutti i container (mantiene i volumi) |
| `pnpm run dev:reset` | Stop + rimuove tutti i volumi (reset completo) |

### Switching provider email

In dev, `apps/api/.dev.vars` ha `EMAIL_PROVIDER=smtp` → tutte le email finiscono in Mailpit.
Per testare il path Resend in locale: imposta `EMAIL_PROVIDER=resend` e `RESEND_API_KEY=<your-key>`.

### Note sicurezza

- Tutti i container hanno bind su `127.0.0.1` — nessuna porta è esposta sulla LAN.
- `sqlite-web` è in **sola lettura**: per modificare il DB usa `wrangler d1 execute --local`.
- Mailpit accetta qualsiasi credenziale SMTP — è pensato esclusivamente per dev/test, mai per traffico reale.
```

### 8.2 Sezione Testing in `docs/development.md`

```markdown
## Testing

I test `apps/api` richiedono lo stack Docker attivo (stesso stack di `pnpm run dev:full`). Il setup vitest (`test/global-setup.ts`) verifica MinIO, Mailpit e webhook-tester prima di partire e crea un bucket MinIO effimero per il run.

```bash
pnpm run dev:full           # avvia lo stack completo (puoi tenerlo aperto in un terminale)
cd apps/api && pnpm test    # esegue la suite contro i container reali
```

Se i container non sono attivi, i test falliscono con istruzioni precise. **Non esistono fallback su `vi.mock`** per email, R2 o webhook — il principio è "test contro gli stessi servizi che girano in dev".
```

### 8.3 `docs/api-reference.md`

Nel paragrafo Email/Notifications (o ovunque sia menzionato Resend), aggiungere callout:
```
> In sviluppo locale il provider email è Mailpit (vedi docs/development.md). Le chiamate
> seguono lo stesso contratto (`EmailProvider.send`), così la pipeline è identica a quella di produzione.
```

### 8.4 `docs/architecture.md`

Aggiungere sezione "Local Dev & Testing Infrastructure" che descrive:
- diagramma testuale: Worker → S3Bucket → MinIO; Worker → SmtpEmailProvider → Mailpit; Test → MinIO/Mailpit/webhook-tester via Docker.
- decisione architetturale: niente più mock di layer di integrazione; i test integrano contro container reali.
- riferimento esplicito al `docker-compose.yml` come parte del runtime di sviluppo.

### 8.5 `CLAUDE.md` root

Sostituire/estendere la sezione **Commands → Root**:

```diff
- pnpm run dev:full        # avvia MinIO + API + Dashboard (richiede Docker)
- pnpm run dev             # Solo API + Dashboard (richiede MinIO già attivo)
- pnpm run dev:storage     # Avvia solo MinIO in background
- pnpm run dev:storage:stop
- pnpm run dev:storage:reset
+ pnpm run dev:full        # UNICO comando di sviluppo: stack Docker completo + API + Dashboard
+ pnpm run dev             # Alias di dev:full
+ pnpm run dev:tunnel-url  # Stampa la URL Cloudflare Quick Tunnel
+ pnpm run dev:mailpit:reset  # Svuota la inbox Mailpit
+ pnpm run dev:logs:<svc>  # Log streaming (mailpit | sqlite | tunnel | minio)
+ pnpm run dev:stop        # Stop dei container
+ pnpm run dev:reset       # Stop + rimozione volumi
```

> Beech richiede Docker. Non esiste una modalità "lightweight"; chi non può/non vuole avere Docker non può sviluppare su Beech.

Nella **Tech Stack Summary** aggiungere riga:
```
| Local dev tooling | Mailpit, sqlite-web, webhook-tester, cloudflared (via docker compose) |
```

### 8.6 `README.md`

Quick start: aggiornare il blocco con la nuova lista porte/servizi avviata da `pnpm run dev:full`. Aggiungere una nota:
> Lo stack richiede Docker. La prima esecuzione scarica ~250 MB di immagini.

---

## 9. Acceptance Criteria finali (riepilogo Issue)

- [x] `docker-compose.yml` contiene `minio`, `minio-init`, `mailpit`, `sqlite-web`, `webhook-tester`, `tunnel`, tutti con bind `127.0.0.1` e healthcheck dove previsto.
- [x] `pnpm run dev:full` avvia tutto lo stack, esegue `bootstrap-d1.mjs` e poi `turbo dev`; gli sviluppatori non hanno bisogno di altri comandi.
- [x] Su un clone fresco senza `.wrangler/state`, `pnpm run dev:full` produce un DB locale popolato con migrazioni 0000→ultima (sentinella: tabella `users` presente).
- [x] Riesecuzione di `pnpm run dev:full` è no-op sul DB (log `bootstrap-d1: DB already initialized — skipping`).
- [x] `pnpm run dev` è alias esatto di `pnpm run dev:full`; non esistono script che avviano l'API senza lo stack Docker.
- [x] Rimossi da `package.json` root: `dev:storage`, `dev:storage:stop`, `dev:storage:reset`.
- [x] `apps/api/src/features/email/providers/smtp.ts` esiste e implementa `EmailProvider` via Mailpit HTTP send API.
- [x] `createProvider` in `email.service.ts` seleziona SMTP/Resend in base a `env.EMAIL_PROVIDER`.
- [x] Tutti i call site (`password-reset/request.ts`, `password-reset/reset.ts`, `automations/action-executors/send-mail.executor.ts`) propagano provider + smtpBaseUrl.
- [x] `apps/api/.dev.vars.example` documenta `EMAIL_PROVIDER`, `SMTP_HOST`, `SMTP_PORT`, `WEBHOOK_TESTER_URL`.
- [x] `wrangler.jsonc` `vars` include i nuovi valori dev.
- [x] `apps/api/src/index.ts` warning copre MinIO e Mailpit quando in `ENV=development`.
- [x] `apps/api/test/docker-precheck.ts` esiste, esporta `assertDockerStackReady()` che pinga MinIO/Mailpit/webhook-tester in parallelo e produce un errore aggregato con la lista di tutti i servizi mancanti.
- [x] `apps/api/test/docker-precheck.runner.ts` è registrato come **primo** `globalSetup` in `vitest.config.ts`, prima di `global-setup.ts`.
- [x] Se anche solo uno dei container è giù, `pnpm test -w apps/api` termina **subito** (zero test eseguiti) con il banner formattato che indica `pnpm run dev:full` come fix.
- [x] Eseguendo `pnpm test -w apps/api` con stack down, il messaggio di errore compare in cima al log, non sepolto fra errori dei singoli test.
- [x] `apps/api/test/helpers/d1-test-database.ts` esiste e implementa l'interfaccia `D1Database` su `better-sqlite3` in-memory, applicando in costruttore tutte le migrazioni `migrations/*.sql` in ordine.
- [x] FTS5 funzionante: un test che esegue `MATCH` contro una tabella `fts_*` passa contro `D1TestDatabase`.
- [x] Grep `MockD1Database` su `apps/api`: zero match. File `mock-d1-database.ts` eliminato.
- [x] I 6 flow test (`flow-admin-auth`, `flow-content-management`, `flow-draft-management`, `flow-media-assets`, `flow-stats`, `flow-system-schema`) usano `D1TestDatabase` e passano verdi.
- [x] `better-sqlite3` aggiunto a `apps/api/package.json` devDependencies; `pnpm ci` funziona in CI Linux senza step extra.
- [ ] `.github/workflows/test.yml` job `test-api` avvia MinIO, Mailpit, webhook-tester con le **stesse immagini, credenziali, porte** di `docker-compose.yml`.
- [ ] `.github/actions/docker-stack/action.yml` esiste come composite action riusabile.
- [ ] Step "Verify Docker stack reachable" in CI fallisce esplicitamente prima di lanciare vitest se uno dei servizi non risponde.
- [ ] La tabella di parità (dev locale vs CI) in `docs/Sprints/media/03-docker-local-dev-tools.md` §9.bis.4 è rispettata: stesse immagini, stesse credenziali, stesso bucket pattern.
- [x] `apps/api/test/flow-media-assets.test.ts` **non contiene** `vi.mock('@aws-sdk/...')` né `vi.hoisted`; usa MinIO reale con bucket effimero.
- [x] `apps/api/test/mocks/mock-r2-client.ts` eliminato.
- [x] `apps/api/src/features/automations/__tests__/action-executors.test.ts` **non contiene** `vi.mock('../../email', ...)` né `vi.stubGlobal('fetch')` per webhook; usa Mailpit e webhook-tester reali.
- [x] Helpers `test/helpers/mailpit-client.ts`, `test/helpers/webhook-tester-client.ts`, `test/helpers/minio-test-bucket.ts` esistono e sono usati dai test.
- [x] Test `email-smtp.integration.test.ts` (nuovo) verde.
- [x] `pnpm test -w apps/api` verde con stack Docker attivo.
- [ ] `docs/development.md` documenta lo stack completo, le porte, i comandi e la sezione Testing.
- [ ] `docs/api-reference.md` e `docs/architecture.md` aggiornati con i riferimenti a Mailpit e alla strategia "no-mock per i layer di integrazione".
- [ ] `CLAUDE.md` (root) e `README.md` aggiornano Quick start e Tech Stack.
- [ ] Grep `webhook\.site` su `docs/` e `apps/`: zero match (eccetto CHANGELOG).
- [x] Grep `vi\.mock\(['"]\@aws-sdk` su `apps/api`: zero match.

---

## 9.bis Task 8 — CI/CD: stesso stack di dev (parità ambienti)

**Principio:** se i test locali girano contro MinIO + Mailpit + webhook-tester reali, **anche la CI** deve farlo. Niente "in CI usiamo mock" — la divergenza degrada la fiducia nei test. GitHub Actions supporta nativamente container come `services:`; usiamo le stesse immagini di `docker-compose.yml` con le stesse credenziali.

### 9.bis.1 Aggiornamento `.github/workflows/test.yml`

Sostituire il job `test-api` con la versione che include i servizi:

```yaml
name: Test

on:
  push:
    branches: [master, devs]
  pull_request:
    branches: [master, devs]

jobs:
  test-api:
    name: API Tests
    runs-on: ubuntu-latest

    # Stesse immagini e credenziali del docker-compose.yml di repo.
    # Tunnel e sqlite-web sono dev-only (UI / esposizione esterna): non servono in CI.
    services:
      minio:
        image: minio/minio:latest
        env:
          MINIO_ROOT_USER: beechdev
          MINIO_ROOT_PASSWORD: beechdevsecret
        ports:
          - 9000:9000
          - 9001:9001
        # GitHub Actions services non supportano `command` direttamente:
        # MinIO va lanciato via entrypoint nell'immagine. Workaround: usare un job step
        # docker run dedicato, oppure l'immagine `bitnami/minio` che accetta env-based config.
        # Soluzione canonica: docker run nello step (vedi nota sotto).

      mailpit:
        image: axllent/mailpit:latest
        ports:
          - 1025:1025
          - 8025:8025
        env:
          MP_MAX_MESSAGES: 500
          MP_SMTP_AUTH_ACCEPT_ANY: 1
          MP_SMTP_AUTH_ALLOW_INSECURE: 1
        options: >-
          --health-cmd "wget --spider -q http://localhost:8025/livez || exit 1"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 10

      webhook-tester:
        image: tarampampam/webhook-tester:latest
        ports:
          - 8084:8080
        options: >-
          --health-cmd "wget -q --spider http://localhost:8080/api/ready || exit 1"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 10

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      # MinIO via `docker run` perché `services:` non gestisce il comando custom
      # (`server /data --console-address ":9001"`). Lo stesso entrypoint dello dev stack.
      - name: Start MinIO
        run: |
          docker run -d --name beech-minio \
            -p 9000:9000 -p 9001:9001 \
            -e MINIO_ROOT_USER=beechdev \
            -e MINIO_ROOT_PASSWORD=beechdevsecret \
            minio/minio:latest server /data --console-address ":9001"
          # wait for health
          for i in {1..20}; do
            curl -sf http://localhost:9000/minio/health/live && break
            sleep 1
          done

      - name: Create test bucket
        run: |
          docker run --rm --network host --entrypoint sh minio/mc:latest -c "
            until mc alias set local http://localhost:9000 beechdev beechdevsecret; do sleep 1; done;
            mc mb -p local/beech-media || true;
            mc anonymous set download local/beech-media || true;
          "

      - name: Install dependencies
        run: pnpm ci

      - name: Build packages (Core)
        run: pnpm run build -w @beechcms/core

      - name: Verify Docker stack reachable (sanity)
        run: |
          curl -sf http://localhost:9000/minio/health/live
          curl -sf http://localhost:8025/livez
          curl -sf http://localhost:8084/api/ready

      - name: Run API Tests
        env:
          BEECH_TEST_BUCKET: beech-media-test-ci
          # Variabili lette dai test via TEST_ENV (vedi fixtures.ts)
          R2_ENDPOINT: http://localhost:9000
          R2_ACCESS_KEY_ID: beechdev
          R2_SECRET_ACCESS_KEY: beechdevsecret
          R2_BUCKET_NAME: beech-media-test-ci
          EMAIL_PROVIDER: smtp
          SMTP_HOST: localhost
          SMTP_PORT: '8025'
          WEBHOOK_TESTER_URL: http://localhost:8084
        run: pnpm test -w @beechcms/api
```

> **Nota MinIO + `services:`**: GitHub Actions non permette di passare il `command` ai container in `services:`. Per immagini che richiedono un comando custom (come `minio server /data --console-address ":9001"`) bisogna usare `docker run` esplicito in uno step. Manteniamo invece `mailpit` e `webhook-tester` in `services:` perché i loro entrypoint default sono già corretti.

### 9.bis.2 Job dashboard

`test-dashboard` resta invariato (i test Vitest del dashboard non integrano con i servizi backend, solo con jsdom + mocks Vite). Se in futuro vorremo test e2e Playwright contro l'API reale, anch'essi avranno bisogno del medesimo blocco `services:` — riusare la composizione qui sopra.

### 9.bis.3 Riusabilità: composite action

Per evitare duplicazione futura, estrarre la configurazione dei servizi in una composite action: `.github/actions/docker-stack/action.yml`.

```yaml
name: 'Beech Docker Stack'
description: 'Starts MinIO + Mailpit + webhook-tester for integration tests (mirrors docker-compose.yml)'
runs:
  using: composite
  steps:
    - name: Start MinIO
      shell: bash
      run: |
        docker run -d --name beech-minio -p 9000:9000 -p 9001:9001 \
          -e MINIO_ROOT_USER=beechdev -e MINIO_ROOT_PASSWORD=beechdevsecret \
          minio/minio:latest server /data --console-address ":9001"
        for i in {1..20}; do curl -sf http://localhost:9000/minio/health/live && break; sleep 1; done

    - name: Start Mailpit
      shell: bash
      run: |
        docker run -d --name beech-mailpit -p 1025:1025 -p 8025:8025 \
          -e MP_SMTP_AUTH_ACCEPT_ANY=1 -e MP_SMTP_AUTH_ALLOW_INSECURE=1 \
          axllent/mailpit:latest
        for i in {1..20}; do curl -sf http://localhost:8025/livez && break; sleep 1; done

    - name: Start webhook-tester
      shell: bash
      run: |
        docker run -d --name beech-webhook-tester -p 8084:8080 \
          tarampampam/webhook-tester:latest
        for i in {1..20}; do curl -sf http://localhost:8084/api/ready && break; sleep 1; done

    - name: Create MinIO bucket
      shell: bash
      run: |
        docker run --rm --network host --entrypoint sh minio/mc:latest -c "
          until mc alias set local http://localhost:9000 beechdev beechdevsecret; do sleep 1; done;
          mc mb -p local/beech-media || true;
          mc anonymous set download local/beech-media || true;
        "
```

`test.yml` diventa allora:
```yaml
      - uses: ./.github/actions/docker-stack
      - run: pnpm test -w @beechcms/api
        env: { /* env vars uguali */ }
```

### 9.bis.4 Coerenza con dev locale

| Aspetto | Dev locale | CI |
|---|---|---|
| Immagini | `minio/minio:latest`, `axllent/mailpit:latest`, `tarampampam/webhook-tester:latest` | **Stesse** |
| Credenziali MinIO | `beechdev` / `beechdevsecret` | **Stesse** |
| Bucket | `beech-media` (dev) + `beech-media-test-<pid>` (test) | `beech-media-test-ci` |
| Porte | 9000, 9001, 1025, 8025, 8084 | **Stesse** |
| Precheck | `docker-precheck.ts` | **Lo stesso codice gira** (curl extra step è ridondante ma documenta intent) |
| Tunnel (cloudflared) | sì (dev only) | no (CI non riceve webhook esterni) |
| sqlite-web | sì (dev only) | no (è una UI) |

### 9.bis.5 Pinning delle immagini

`:latest` è accettabile in dev (auto-aggiornamento), **non** in CI (build non riproducibili). Quando lo Sprint 03 atterra, in un follow-up immediato:
- Pinnare le immagini a digest in `.github/actions/docker-stack/action.yml`:
  - `minio/minio@sha256:<digest>` letto da `docker pull minio/minio:latest && docker inspect ...`.
  - Idem per `axllent/mailpit`, `tarampampam/webhook-tester`, `minio/mc`.
- In `docker-compose.yml` lasciare `:latest` (developer-friendliness).
- Aggiungere dependabot config per Docker images (`.github/dependabot.yml` con `package-ecosystem: docker`).

> Per **questo sprint** è sufficiente `:latest` ovunque, lo Sprint successivo gestisce il pinning.

### 9.bis.6 Accettazione CI

- Su PR verso `master`/`devs`, il workflow `Test` avvia MinIO/Mailpit/webhook-tester e li health-check prima di lanciare `pnpm test -w @beechcms/api`.
- Se uno dei servizi non si avvia, lo step "Verify Docker stack reachable (sanity)" fallisce con messaggio chiaro **prima** che vitest parta.
- I test stessi falliscono comunque tramite `docker-precheck.ts` se la sanity passa ma il container si spegne (defense-in-depth).
- Il tempo totale del job non aumenta di più di ~30s (pull immagini + health wait).
- Composite action `.github/actions/docker-stack/action.yml` riusabile da qualsiasi futuro job (e2e, security scan, ecc.).

---

## 10. Rischi e mitigazioni

| Rischio | Mitigazione |
|---|---|
| Lentezza dei test (rete loopback verso container) | Bind tutto su `127.0.0.1`, healthcheck rapidi (5s). Test sequenziali per file ma paralleli a livello di vitest (default). Sopra i 60s totali → considerare `pool: 'forks'` con limite. |
| CI senza Docker | Aggiungere `services:` con MinIO/Mailpit/webhook-tester nel workflow GitHub Actions in uno sprint successivo. Per ora documentare in `docs/development.md` che la CI non gira ancora questi test (li segnerà come skipped solo se la `global-setup` rileva `process.env.CI && !process.env.BEECH_DOCKER_AVAILABLE`). **Out of scope di questo sprint**, ma fail-fast esplicito sì. |
| API webhook-tester instabile o cambiata | Helper `webhook-tester-client.ts` è isolato in un solo file. Se il container scelto non espone una HTTP read API stabile, sostituire con `mendhak/http-https-echo` + `docker logs` polling. |
| Mailpit accetta auth qualsiasi → false positive di sicurezza | Documentare esplicitamente in `docs/development.md` che è dev-only; il `wrangler.jsonc` prod NON ha `EMAIL_PROVIDER=smtp`. |
| Path `.wrangler/state/.../d1/*.sqlite` cambia con upgrade Wrangler | Lo script `entrypoint` di `sqlite-web` fa glob auto-discover, non è hard-coded sul filename. |
| Cloudflared Quick Tunnel URL effimera e variabile a ogni restart | Documentato come accettabile; lo script `pnpm run dev:tunnel-url` la rilegge ogni volta. Per uso prolungato, lo sviluppatore può configurare un tunnel nominato (fuori scope). |
| Test che dipendono dall'ordine (es. condivisione bucket) | Ogni test genera key univoche con prefisso `test-${nanoid}-`; il bucket effimero è per intero run (PID), non per test. |
| `better-sqlite3` non compila su Windows senza Visual Studio Build Tools | Documentare in `docs/development.md` il prerequisito Windows (`pnpm install --global windows-build-tools` o VS Build Tools 2022). Su CI Linux è zero-config. Alternativa di emergenza: `node:sqlite` (Node 22+) o `wa-sqlite` (WASM, niente build nativa) — valutare se compatibilità FTS5 è OK. |
| Divergenza semantica fra `better-sqlite3` (SQLite 3.4x) e D1 (SQLite 3.45+) | D1 sta su SQLite recente; pinnare `better-sqlite3` v11+ che bundle SQLite 3.45+. Aggiungere un test che verifica `SELECT sqlite_version()` in entrambi gli ambienti e logga differenze. |
| Migrazioni eseguite ad ogni `beforeEach` rallentano i test | better-sqlite3 in-memory è velocissimo (~10ms per applicare tutte le migrazioni Beech). Se diventasse un problema, cachare uno snapshot binario via `db.backup()` e ricaricarlo per ogni test. Misurare prima di ottimizzare. |
| GitHub Actions `services:` non supporta `command` custom (es. MinIO) | Documentato in §9.bis.1: MinIO viene avviato via `docker run` esplicito in uno step. Mailpit e webhook-tester restano in `services:` perché usano entrypoint default. |
| `:latest` in CI rende le build non riproducibili | Sprint successivo pinna le immagini a digest + dependabot per Docker. Per Sprint 03 accettiamo `:latest` (documentato in §9.bis.5). |
