# Sprint 08 — Webhook Security Hardening

> **Prerequisites**: Sprints 01–07 hanno shippato e sono verdi. Il sistema
> automazioni è in produzione e l'executor `webhook` è invocato dal runner
> per ogni azione di tipo `webhook` definita in un'automazione. Questo
> sprint chiude 4 vulnerabilità individuate in audit sull'executor.
>
> Files toccati direttamente:
> - `apps/api/src/features/automations/action-executors/webhook.executor.ts`
> - `apps/api/src/features/automations/action-executors/index.ts`
> - `apps/api/src/features/automations/automations.schema.ts`
> - `apps/dashboard/src/features/automations/schema/automation.schema.ts`
> - `apps/dashboard/src/features/automations/components/action-forms/webhook-form.tsx`
> - `apps/api/wrangler.jsonc`
> - `apps/api/worker-configuration.d.ts` (rigenerato via `npm run cf-typegen`)
> - `docs/automations.md`
> - `apps/api/src/features/automations/__tests__/automations.schema.test.ts`
> - nuovo: `apps/api/src/features/automations/__tests__/webhook.executor.test.ts`

---

## 1. Why this sprint

Un audit completo dell'executor webhook ha rivelato 4 vulnerabilità —
una critica per integrità, una critica per SSRF, due medie per data leak e
DoS sul runner. L'executor è uno dei pochi punti del sistema da cui il
worker effettua chiamate HTTP arbitrarie verso destinazioni configurate
dall'utente: senza hardening, può essere usato come pivot SSRF verso le
metadata API del cloud, oppure come canale di esfiltrazione dell'intero
record (executor oggi serializza l'entry intera quando `body_template` è
omesso).

Lo sprint risolve tutto in modo additivo: nessuna migrazione D1, nessun
breaking change sul formato `actions` JSON (la colonna resta intatta),
solo validazione più stretta a monte e firma + timeout a runtime.

---

## 2. Current state (do not re-explore)

### 2.1 Executor — `apps/api/src/features/automations/action-executors/webhook.executor.ts`

```ts
import type { AutomationAction } from '@beechcms/core'
import type { ResolvedContext } from '../context-resolver'
import { interpolate } from '../automation-runner.utils'

type WebhookAction = Extract<AutomationAction, { type: 'webhook' }>

export async function executeWebhook(
  action: WebhookAction,
  context: ResolvedContext,
): Promise<void> {
  const entry = context.triggerEntry ?? {}
  const body = action.body_template
    ? interpolate(action.body_template, context)
    : JSON.stringify(entry)

  const response = await fetch(action.url, {
    method: action.method ?? 'POST',
    headers: { 'Content-Type': 'application/json', ...(action.headers ?? {}) },
    body,
  })

  if (!response.ok) {
    throw new Error(`Webhook ${action.url} responded ${response.status}`)
  }
}
```

Punti critici:
- Body fallback su `JSON.stringify(entry)` → fuga dati [MED-1].
- `fetch` senza `signal` → DoS sul runner [MED-2].
- Nessuna firma sul payload [CRIT-1].
- Nessun accesso a `env` → la firma richiede iniezione esplicita di `WEBHOOK_SECRET`.

### 2.2 Call site — `apps/api/src/features/automations/action-executors/index.ts:24`

```ts
case 'webhook': return executeWebhook(action, ctx.context)
```

`ActionContext` (line 9) **già espone `env: Record<string, string | undefined>`**
ma non lo passa al webhook executor. Va aggiunto come terzo argomento.

### 2.3 Schema API — `apps/api/src/features/automations/automations.schema.ts:76`

```ts
const webhookActionSchema = z.object({
  type: z.literal('webhook'),
  url: z.string().url(),
  method: z.enum(['POST', 'GET', 'PUT']).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  body_template: z.string().optional(),
})
```

Nessuna restrizione su protocollo, su IP privati, né su `body_template`.

### 2.4 Schema dashboard mirror — `apps/dashboard/src/features/automations/schema/automation.schema.ts:122`

```ts
if (data.type === 'webhook') {
  if (!data.url) {
    ctx.addIssue({ ... message: 'automations.editor.errors.urlRequired', path: ['url'] })
  } else if (!z.string().url().safeParse(data.url).success) {
    ctx.addIssue({ ... message: 'automations.editor.errors.urlInvalid', path: ['url'] })
  }
}
```

Idem: nessuna restrizione protocollo / IP privati / body required.

### 2.5 Form dashboard — `webhook-form.tsx`

`body_template` è una textarea libera con placeholder
`'{"event": "{{trigger_event}}"}'`. Nessun default generato dai branch del
seed; nessun marker di "required".

### 2.6 Wrangler config — `apps/api/wrangler.jsonc:74`

`vars` contiene già `JWT_SECRET`, `WEBHOOK_TESTER_URL`, etc. `WEBHOOK_SECRET`
va aggiunto come `vars` per dev (placeholder) e come secret per produzione.
La rigenerazione dei tipi via `npm run cf-typegen` riflette automaticamente
la nuova chiave dentro `Env` (consumata da `ActionContext.env`).

### 2.7 Test esistente schema — `apps/api/src/features/automations/__tests__/automations.schema.test.ts:8`

```ts
const validWebhookAction = { type: 'webhook' as const, url: 'https://example.com/hook' }
```

Va aggiornato: l'URL HTTPS valido resta accettato, ma il body deve
diventare obbligatorio → il test deve aggiungere `body_template: '{}'`.

---

## 3. Design

### 3.1 [CRIT-1] HMAC-SHA256 signature

Header `X-BeechCMS-Signature: sha256=<hex>` calcolato sul body raw con
secret globale `env.WEBHOOK_SECRET`. Cloudflare Workers espone Web Crypto
SubtleCrypto nativamente — niente dipendenze Node.

- Se `WEBHOOK_SECRET` è assente l'header viene omesso (degradazione
  retrocompatibile e logging `console.warn` una volta per cold start).
- Header non sovrascrivibile dall'utente: lo applichiamo dopo
  `...(action.headers ?? {})` per essere autorevoli.

### 3.2 [CRIT-2] SSRF block — schema-level

Refinement Zod a due livelli, applicato sia in API che in dashboard mirror:

1. `URL(u).protocol === 'https:'` → solo HTTPS.
2. Hostname non in regex IP privati/loopback/link-local/ULA/IPv6 locali.

Regex centralizzata in una nuova costante esportata dal core per evitare
divergenza tra API e dashboard:

```ts
// packages/core/src/webhook-validation.ts (NUOVO)
export const PRIVATE_HOST_REGEX =
  /^(localhost|127\.\d+\.\d+\.\d+|::1|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|fc00:|fe80:|0\.0\.0\.0)/i

export function isPrivateHost(hostname: string): boolean {
  return PRIVATE_HOST_REGEX.test(hostname)
}
```

Riesportata da `packages/core/src/index.ts`. Sia API che dashboard
importano `isPrivateHost` da `@beechcms/core`.

> Nota: la regex resta esplicita anche se ridondante per IPv6 (le suite
> Workers normalizzano già `[::1]` a `::1` dopo `new URL()`).

### 3.3 [MED-1] `body_template` required

- Schema API: `body_template: z.string().min(1)`.
- Schema dashboard mirror: `superRefine` aggiunge issue
  `automations.editor.errors.bodyRequired` se vuoto.
- Executor: rimosso il fallback su `JSON.stringify(entry)`; `body` è
  sempre `interpolate(action.body_template, context)`.
- Form dashboard: pre-fill smart al momento della selezione del tipo
  azione (vedi §3.6) — la textarea non viene mai mostrata vuota.

### 3.4 [MED-2] Fetch timeout

`signal: AbortSignal.timeout(8_000)` — supporto nativo Workers,
non serve polyfill. In caso di timeout l'`AbortError` viene catturato e
riemesso come errore "Webhook X timed out after 8s" così il logger
dell'automation runner lo distingue da un 5xx.

### 3.5 Aggiornamento contratto executor

L'executor diventa:

```ts
export async function executeWebhook(
  action: WebhookAction,
  context: ResolvedContext,
  env: Record<string, string | undefined>,
): Promise<void>
```

Call site aggiornato in `action-executors/index.ts:24`:

```ts
case 'webhook': return executeWebhook(action, ctx.context, ctx.env)
```

### 3.6 UI — smart default per `body_template`

Quando l'utente seleziona "webhook" come tipo azione (o quando un webhook
è creato vuoto), il form genera un default basato sul seed corrente
dell'automazione (`useSchema()` espone i branch del seed).

```jsonc
// per seed "posts" con branch id/title/status/created_at
{
  "id": "{{id}}",
  "title": "{{title}}",
  "status": "{{status}}",
  "created_at": "{{created_at}}"
}
```

Algoritmo (in `webhook-form.tsx`):

1. `const seed = useAutomationTriggerSeed()` — hook già esistente
   nell'editor che restituisce il seed legato al `seed_slug` dell'automazione.
2. Se `watch('actions.${index}.body_template')` è vuoto stringificato →
   `setValue(...)` con il default costruito da `seed.branches`.
3. Solo branch con `policies.public !== false` vengono inclusi
   (rispetta la branch policy `public` via `resolvePolicies()` da `@beechcms/core`).
4. L'utente può cancellare tutto e ricominciare; il pre-fill avviene una
   sola volta al mount quando il template è vuoto.

> Compatibilità n8n: il default usa solo placeholder Mustache già
> riconosciuti da `interpolate()`. n8n riceve un JSON piatto, mappabile
> via `$json.<field>` senza extra parsing.

### 3.7 Env e wrangler

In `apps/api/wrangler.jsonc` aggiungere a `vars`:

```jsonc
"WEBHOOK_SECRET": "dev-webhook-secret-changeme"
```

In produzione il valore va impostato come secret:

```bash
npx wrangler secret put WEBHOOK_SECRET
```

Eseguire `npm run cf-typegen` per rigenerare `Env` con la nuova chiave.

---

## 4. Deliverables

```
[ ] Task 1 — Core: PRIVATE_HOST_REGEX + isPrivateHost in @beechcms/core
[ ] Task 2 — API zod schema: HTTPS-only, SSRF block, body_template required
[ ] Task 3 — Dashboard zod schema mirror (stesse refinement)
[ ] Task 4 — Executor: signBody (HMAC), no body fallback, timeout, env param
[ ] Task 5 — Call site action-executors/index.ts → passa ctx.env all'executor
[ ] Task 6 — wrangler.jsonc: WEBHOOK_SECRET in vars; cf-typegen
[ ] Task 7 — UI: smart default body_template in webhook-form.tsx
[ ] Task 8 — Test: webhook.executor.test.ts (firma, timeout, no fallback)
[ ] Task 9 — Test: automations.schema.test.ts (HTTPS-only, SSRF, body required)
[ ] Task 10 — Doc: docs/automations.md sezione "Webhook signature verification"
[ ] Task 11 — Manual smoke (HTTPS, HTTP rejected, signature against n8n)
```

---

## 5. Task details

### Task 1 — Core helper (`packages/core/src/webhook-validation.ts`)

Crea il file con:

```ts
export const PRIVATE_HOST_REGEX =
  /^(localhost|127\.\d+\.\d+\.\d+|::1|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|fc00:|fe80:|0\.0\.0\.0)/i

export function isPrivateHost(hostname: string): boolean {
  return PRIVATE_HOST_REGEX.test(hostname)
}
```

Aggiungere `export * from './webhook-validation'` in
`packages/core/src/index.ts` (oppure export esplicito coerente con lo
stile del file).

### Task 2 — API schema (`apps/api/src/features/automations/automations.schema.ts:76`)

Sostituisci `webhookActionSchema`:

```ts
import { isPrivateHost } from '@beechcms/core'

const webhookActionSchema = z.object({
  type: z.literal('webhook'),
  url: z
    .string()
    .url()
    .refine((u) => {
      try { return new URL(u).protocol === 'https:' } catch { return false }
    }, { message: 'automations.editor.errors.webhookHttpsRequired' })
    .refine((u) => {
      try { return !isPrivateHost(new URL(u).hostname) } catch { return false }
    }, { message: 'automations.editor.errors.webhookPrivateHostBlocked' }),
  method: z.enum(['POST', 'GET', 'PUT']).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  body_template: z.string().min(1, 'automations.editor.errors.bodyRequired'),
})
```

I message-key i18n vivono nel dashboard locales (vedi Task 3); l'API li
ritorna verbatim (il client mostra il messaggio tradotto).

### Task 3 — Dashboard schema mirror (`apps/dashboard/src/features/automations/schema/automation.schema.ts:122`)

Sostituisci il blocco `if (data.type === 'webhook')`:

```ts
import { isPrivateHost } from '@beechcms/core'

if (data.type === 'webhook') {
  if (!data.url) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'automations.editor.errors.urlRequired', path: ['url'] })
  } else if (!z.string().url().safeParse(data.url).success) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'automations.editor.errors.urlInvalid', path: ['url'] })
  } else {
    try {
      const parsed = new URL(data.url)
      if (parsed.protocol !== 'https:') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'automations.editor.errors.webhookHttpsRequired', path: ['url'] })
      } else if (isPrivateHost(parsed.hostname)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'automations.editor.errors.webhookPrivateHostBlocked', path: ['url'] })
      }
    } catch { /* unreachable: url() parse already passed */ }
  }
  if (!data.body_template || data.body_template.trim() === '') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'automations.editor.errors.bodyRequired', path: ['body_template'] })
  }
}
```

Aggiungi chiavi i18n in `apps/dashboard/src/locales/<lang>/translation.json`:

- `automations.editor.errors.webhookHttpsRequired`
- `automations.editor.errors.webhookPrivateHostBlocked`
- (`bodyRequired` esiste già — è usata anche da `send_mail`)
- `automations.actions.webhookBodyHint`
- `automations.actions.webhookSecretHint`

### Task 4 — Executor (`apps/api/src/features/automations/action-executors/webhook.executor.ts`)

Riscrittura completa:

```ts
import type { AutomationAction } from '@beechcms/core'
import type { ResolvedContext } from '../context-resolver'
import { interpolate } from '../automation-runner.utils'

type WebhookAction = Extract<AutomationAction, { type: 'webhook' }>

const WEBHOOK_TIMEOUT_MS = 8_000

let warnedNoSecret = false

async function signBody(body: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
  return 'sha256=' + Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function executeWebhook(
  action: WebhookAction,
  context: ResolvedContext,
  env: Record<string, string | undefined>,
): Promise<void> {
  const body = interpolate(action.body_template, context)

  const secret = env.WEBHOOK_SECRET
  let signatureHeader: Record<string, string> = {}
  if (secret) {
    signatureHeader = { 'X-BeechCMS-Signature': await signBody(body, secret) }
  } else if (!warnedNoSecret) {
    warnedNoSecret = true
    console.warn('[webhook] WEBHOOK_SECRET not set — outgoing webhooks are unsigned')
  }

  try {
    const response = await fetch(action.url, {
      method: action.method ?? 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(action.headers ?? {}),
        ...signatureHeader, // applied last → not overridable by user-supplied headers
      },
      body,
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    })

    if (!response.ok) {
      throw new Error(`Webhook ${action.url} responded ${response.status}`)
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new Error(`Webhook ${action.url} timed out after ${WEBHOOK_TIMEOUT_MS}ms`)
    }
    throw err
  }
}
```

Note:
- `body_template` ora è required a livello di schema → niente fallback,
  niente check `action.body_template`.
- L'header firma viene fuso **dopo** `action.headers` → l'utente non
  può sostituirlo per disabilitare la firma.
- `warnedNoSecret` è module-scoped per warn-once per worker instance.
- `AbortSignal.timeout` lancia `TimeoutError` (DOMException con
  `name === 'TimeoutError'`) — distinto dai 5xx remoti.

### Task 5 — Call site (`apps/api/src/features/automations/action-executors/index.ts:24`)

```ts
case 'webhook': return executeWebhook(action, ctx.context, ctx.env)
```

`ActionContext.env` (line 11) esiste già — nessuna modifica al runner.

### Task 6 — wrangler.jsonc + cf-typegen

In `apps/api/wrangler.jsonc` aggiungere a `vars`:

```jsonc
"WEBHOOK_SECRET": "dev-webhook-secret-changeme"
```

Poi:

```bash
cd apps/api
npm run cf-typegen
```

`worker-configuration.d.ts` ora include `WEBHOOK_SECRET: string`.
In `apps/api/README.md` o nel commento di `wrangler.jsonc`, documentare
che in produzione va impostato come secret:

```bash
npx wrangler secret put WEBHOOK_SECRET
```

### Task 7 — Form dashboard (`webhook-form.tsx`)

1. Importa il seed corrente dell'automazione (verifica come `set-variable-form.tsx`
   accede al seed via `useSchema()` — replica lo stesso pattern).
2. Aggiungi `useEffect` che pre-fill `body_template` quando vuoto:

```ts
useEffect(() => {
  const current = getValues(`actions.${index}.body_template` as any) as string
  if (current && current.trim() !== '') return
  const seed = currentTriggerSeed // ottenuto da useSchema() + seed_slug dell'automazione
  if (!seed) return
  const publicBranches = seed.branches.filter((b) => b.policies?.public !== false)
  const obj: Record<string, string> = { id: '{{id}}' }
  for (const b of publicBranches) obj[b.alias] = `{{${b.alias}}}`
  setValue(`actions.${index}.body_template` as any, JSON.stringify(obj, null, 2))
}, [index, currentTriggerSeed])
```

3. Aggiungi marker `*` accanto al label e mostra l'errore
   `actionErrors?.body_template` sotto la textarea.

4. Sotto la textarea, banner informativo (chiave i18n
   `automations.actions.webhookSecretHint`):

> "Beech firma ogni richiesta con HMAC-SHA256 nell'header
> `X-BeechCMS-Signature`. Configura `WEBHOOK_SECRET` nel worker per
> abilitare la firma. Verifica la firma sul ricevente prima di
> elaborare il payload."

### Task 8 — Test executor (`apps/api/src/features/automations/__tests__/webhook.executor.test.ts`)

Nuovo file. Casi minimi:

| # | Scenario | Assertion |
|---|---|---|
| 1 | `WEBHOOK_SECRET` impostato | `fetch` chiamato con header `X-BeechCMS-Signature: sha256=<hex>` corretto rispetto al body |
| 2 | `WEBHOOK_SECRET` assente | header firma assente; `console.warn` chiamato una sola volta |
| 3 | Header `X-BeechCMS-Signature` user-supplied | sovrascritto dalla firma calcolata, non dal valore utente |
| 4 | Endpoint risponde 500 | throw con messaggio contenente `500` |
| 5 | Endpoint non risponde entro 8s | throw con messaggio "timed out after 8000ms" (usa `vi.useFakeTimers` + `AbortSignal.timeout` mock) |
| 6 | `body_template` con placeholder | `fetch` riceve body con interpolazione applicata |
| 7 | Verifica firma — recalcola HMAC con la stessa chiave sul body inviato e confronta con header | identico |

Mock di `globalThis.fetch` via `vi.spyOn(globalThis, 'fetch').mockResolvedValue(...)`.
HMAC verifica usando direttamente `crypto.subtle` di Node 20+ /
better-sqlite3 env — non serve mock.

### Task 9 — Test schema (`apps/api/src/features/automations/__tests__/automations.schema.test.ts`)

Aggiorna `validWebhookAction` (line 8) a `{ type: 'webhook' as const, url: 'https://example.com/hook', body_template: '{}' }`.

Aggiungi casi:

| # | Input url + body | Atteso |
|---|---|---|
| 1 | `http://example.com` | reject `webhookHttpsRequired` |
| 2 | `https://localhost/x` | reject `webhookPrivateHostBlocked` |
| 3 | `https://127.0.0.1/x` | reject |
| 4 | `https://169.254.169.254/x` | reject (AWS metadata) |
| 5 | `https://10.0.0.5/x` | reject |
| 6 | `https://192.168.1.1/x` | reject |
| 7 | `https://172.16.0.1/x` | reject |
| 8 | `https://172.32.0.1/x` | **accept** (out of private range) |
| 9 | `https://example.com/x`, no body | reject `bodyRequired` |
| 10 | `https://example.com/x`, body `'{}'` | accept |

### Task 10 — Doc (`docs/automations.md`)

Aggiungere sezione "Webhook signature verification" con:
- spiegazione header `X-BeechCMS-Signature`;
- snippet di verifica per ricevente n8n Code node (vedi audit);
- snippet di verifica generico Node/Workers;
- nota che la firma è omessa se `WEBHOOK_SECRET` non è settato e che
  in produzione deve esserlo;
- nota che sono permessi solo URL HTTPS pubblici (no IP privati,
  no metadata API).

### Task 11 — Manual smoke

1. `npm run build` in `packages/core` → green.
2. `cd apps/api && npm run cf-typegen` → file types rigenerato senza errori.
3. `npm run test` in root → tutte le suite verdi (vecchi test
   `automations.schema.test.ts` aggiornati per body required).
4. `npm run dev` → apri dashboard → crea automazione webhook:
   - URL `http://example.com` → form mostra errore HTTPS.
   - URL `https://localhost/x` → form mostra errore private host.
   - URL `https://example.com/hook` → accettato; textarea body
     pre-compilata col template del seed.
5. Sul container `webhook-tester` (porta 8084, già configurato in
   `wrangler.jsonc:92`):
   - Trigger un evento → ispeziona la richiesta ricevuta;
     verifica presenza header `X-BeechCMS-Signature: sha256=...`.
   - Ricalcola HMAC localmente con `WEBHOOK_SECRET` → confronta.
6. Disattiva `WEBHOOK_SECRET` da `vars`, restart worker → header
   firma assente; log mostra il warning "outgoing webhooks are unsigned".
7. Configura un endpoint che dorme 10s (es. `https://httpbin.org/delay/10`)
   → l'azione termina con errore "timed out after 8000ms" dopo ~8s.

---

## 6. Validation

- `npm run build` (core), `npx tsc --noEmit` (api, dashboard) — zero errori.
- `npm run test` in `apps/api/` — `webhook.executor.test.ts` e
  `automations.schema.test.ts` aggiornati passano; tutte le altre suite
  invariate (`automations.handler`, `automations.repository`,
  `automation-runner`, etc.) restano verdi.
- Manual smoke (Task 11 step 4–7) passa.

---

## 7. Acceptance criteria

- [ ] Outgoing webhooks includono `X-BeechCMS-Signature: sha256=<hex>`
      quando `env.WEBHOOK_SECRET` è impostato; assenti altrimenti con
      warning loggato una volta per worker instance.
- [ ] L'header firma non è sovrascrivibile da `action.headers`.
- [ ] Schema API rifiuta URL non-HTTPS con
      `automations.editor.errors.webhookHttpsRequired`.
- [ ] Schema API rifiuta hostname privati/loopback/link-local
      (compreso `169.254.169.254`) con
      `automations.editor.errors.webhookPrivateHostBlocked`.
- [ ] Schema API richiede `body_template.min(1)`; nessuna fuga
      `JSON.stringify(entry)` possibile.
- [ ] Schema dashboard mirror produce gli stessi errori inline nel
      form, con le stesse i18n keys.
- [ ] `webhook-form.tsx` pre-compila `body_template` con un template
      generato dai branch pubblici del trigger seed quando il campo è vuoto.
- [ ] `fetch` outgoing usa `AbortSignal.timeout(8_000)`; il timeout
      produce un errore distinguibile ("timed out after 8000ms").
- [ ] `cf-typegen` rigenerato; `WEBHOOK_SECRET` presente in
      `worker-configuration.d.ts` e in `wrangler.jsonc:vars`.
- [ ] `docs/automations.md` aggiornato con snippet di verifica firma
      per n8n e per generico ricevente.
- [ ] `isPrivateHost` esportato da `@beechcms/core` ed importato sia
      da API che da dashboard (unica fonte di verità della regex).

---

## 8. Out of scope

- Allowlist/denylist esplicite di domini per webhook (resta SSRF block
  by hostname pattern).
- Rotation/multi-secret per la firma (es. supporto a più chiavi attive
  per migrazione progressiva): un solo `WEBHOOK_SECRET` globale.
- Retry policy / dead-letter per webhook falliti — già responsabilità
  del runner (sprint futuro su resilienza automazioni).
- Per-action timeout configurabile via UI; 8s è il valore hardcoded.
- Risoluzione DNS-time SSRF (la regex IP non protegge da hostname che
  risolvono a IP privati). Nota in `docs/automations.md` come
  limitazione nota; mitigazione completa richiede risoluzione DNS
  prima del `fetch`, non disponibile su Workers runtime.
- Verifica firma su webhook **in entrata** (es. webhook-trigger da
  servizi esterni) — fuori scope, riguarderebbe `apps/api/src/features/public/`.
