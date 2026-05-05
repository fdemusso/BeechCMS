# Sprint: Developer Experience Simplification – Piano Definitivo per Claude Code

## Obiettivo e Contesto

**Goal principale:**  
Ridurre al minimo ogni ostacolo tra un developer e un progetto BeechCMS funzionante, su tutte le 5 fasi del ciclo di vita (Installazione, Configurazione, Sviluppo/API, Deploy, Maintenance) **senza** semplificare il modello mentale fondamentale (seeds-as-code, Cloudflare Workers, D1, R2, TypeScript restano così come sono).[file:1]

**Persona target:**  
Mid-level JS/TS dev che:

- conosce npm, ha già fatto almeno un sito/app
- non ha mai usato Cloudflare Workers/D1/R2
- usa un framework frontend (Next/Nuxt/Vite/…)
- Beech viene usato dal suo cliente finale; lui costruisce il sito con Beech come “content backend”.

**Principi di DX:**

- Zero friction nei **primi 5 minuti** (setup locale + primo contenuto).
- Messaggi di errore sempre **actionable** (cosa è successo, perché, comando da eseguire).
- Golden path esplicito: un percorso consigliato che porta a “contenuto visibile + API funzionante” nel minor numero di step.
- Seeds rimangono **code-first**; eventuali wizard generano codice, non lo sostituiscono.

---

## Vista d’Alto Livello dei Flow

1. **Installazione & Primo Avvio (Phase 1 + 1.5)**
   - Scaffolding progetto (`npm create @beechcms/cms`).
   - `beech init --db` per check file + inizializzazione D1 locale.[file:1]
   - `beech seed:load --local` per creare tabelle contenuti.[file:1]
   - `wrangler dev` per avviare Worker e dashboard su `localhost:8789/admin`.[file:1]
   - Nuovi flow:
     - R2 usato via binding Miniflare in locale (senza credenziali).
     - Check login wrangler e placeholder in `wrangler.jsonc`.
     - Widget “Health / Checklist” in dashboard che indica stato (DB, seeds, primo contenuto).

2. **Configurazione Contenuti (Phase 2 + Wizard Seeds + Sample Data)**
   - Developer definisce/edita i Seeds in `seeds.ts` usando `defineSeed` da `beechcms/core`.[file:1]
   - `beech seed:load` compila seeds → SQL DDL per D1.[file:1]
   - Nuovi flow:
     - `beech validate` per validare seeds prima del load.
     - Wizard CLI `beech seed:create` che genera Seeds TypeScript.
     - Opzione `--with-examples` per avere un blog di esempio con contenuti demo.

3. **Sviluppo Sito & API Learning (Phase 3 + schema endpoint DX)**
   - Developer tiene in parallelo `wrangler dev` (API+admin) e server frontend (es. Next su 3000).[file:1]
   - Consuma la Public API (`/api/v1/public/:slug`) con `X-API-Key`.[file:1]
   - Nuovi flow:
     - CORS auto-permissivo per `localhost:*` in dev.
     - Endpoint pubblico `/api/v1/public/schema` (JSON + opzionale HTML) per introspezione seeds e generazione SDK.
     - Output di `beech init` che stampa le API key rilevate.

4. **Deploy (Phase 4 + beech deploy)**
   - `npm run deploy` → deploy Workers + migrazioni D1 built-in.[file:1]
   - `npx beech seed:load` → sync schema contenuti su DB remoto.[file:1]
   - Nuovi flow:
     - `beech init --db --remote` come tool di verifica post-deploy.
     - `beech deploy` wrapper che orchestra deploy + seed + check `/admin`.

5. **Maintenance & Upgrade (Phase 5 + health check DX)**
   - Update pacchetti Beech, gestione evoluzione schema, check stato DB.[file:1]
   - Nuovi flow:
     - `beech update`.
     - Miglioramento `beech seed:diff` (colonne orfane).
     - Documentazione “Schema evolution” + “Daily workflow”.
     - (Opzionale) Telemetria DX opt-in per capire dove i dev si bloccano.

---

## Phase 1 – Installazione & Primo Avvio

### Flow Attuale (da preservare)

- Scaffolding: `npm create @beechcms/cms` (o `npx beechcms/cms`).[file:1]
- Nel progetto:
  - `npx beech init --db` → check file + creazione tabelle di sistema D1 (locale).[file:1]
  - `npx beech seed:load --local` → crea tabelle contenuti da `seeds.ts`.[file:1]
  - `npx wrangler dev` → avvia Worker su `http://localhost:8789`, dashboard su `/admin`.[file:1]

### Problemi da Risolvere

1. **Upload media bloccato in locale da R2**
   - Upload fa chiamate HTTP S3-compatibili con credenziali R2 da `.dev.vars`; se vuoto (clone nuovo), fallisce o dà 403 criptici.[file:1]

2. **Errore wrangler login poco chiaro**
   - Se non loggato a Cloudflare, `beech init --db` fallisce con errore wrangler poco intelligibile (timeout/network).[file:1]

3. **Check file parziale**
   - `beech init` già verifica `worker.ts`, `wrangler.jsonc` e `seeds.ts`, ma non controlla placeholder e non comunica chiaramente i prossimi step.[file:1]

### Implementazioni

#### 1. R2 Local Fallback via Miniflare Binding

**File:** `apps/api/src/upload.ts` (o equivalente).  

**Logica:**

- Rilevare modalità locale vs produzione:
  - Se `context.env.R2_ACCESS_KEY_ID` è **assente o vuota** → **modalità locale**.
  - In locale usare direttamente `context.env.MEDIA_BUCKET.put()` / `.get()` (binding R2 Miniflare).
  - In produzione mantenere il path S3-compatibile HTTP esistente.

**Pseudo-codice:**

```ts
const isLocal = !context.env.R2_ACCESS_KEY_ID;

if (isLocal) {
  await context.env.MEDIA_BUCKET.put(key, body, /* options */);
} else {
  // path S3-compatibile esistente (fetch verso endpoint R2)
}
```

Anche la route di serve media (`GET /api/media/:key`) deve biforcarsi allo stesso modo.

**Outcome DX:**

- `.dev.vars` può restare vuoto dopo il clone.
- Il dev può caricare immagini in locale immediatamente, senza toccare le credenziali R2.

#### 2. `beech init`: wrangler auth check

**File:** `packages/cli/src/commands/init.ts`.[file:1]

**Logica:**

- Prima di qualsiasi step DB:
  - Eseguire `npx wrangler whoami --json`.
  - Se exit code ≠ 0:
    - Stampare messaggio chiaro e uscire con codice 1.

**Messaggio proposto:**

```text
✗ Not logged in to Cloudflare

BeechCMS needs access to your Cloudflare account to manage the D1 database.

→ Run: npx wrangler login
→ Then retry: npx beech init --db
```

#### 3. `beech init`: placeholder in `wrangler.jsonc`

**File:** `packages/cli/src/commands/init.ts` (dove già si usa `findWranglerConfig` e `resolveDbName`).[file:1]

**Implementazione:**

- Leggere `wrangler.jsonc` (già fatto da `resolveDbName`).[file:1]
- Cercare pattern noti:
  - `FILL_IN_YOUR_D1_DATABASE_ID`
  - `database_id` vuoto
  - (eventuali altri placeholder noti)
- Se trovati, stampare warning **prima** di toccare il DB:

```text
⚠ wrangler.jsonc contains placeholder values:

- d1.database_id is FILL_IN_YOUR_D1_DATABASE_ID

Update your D1 database_id in wrangler.jsonc,
or create the database with:

  npx wrangler d1 create my-project-db

Then retry: npx beech init --db
```

#### 4. Checklist di avvio & Output migliorato

**File:** `packages/cli/src/commands/init.ts` + docs.  

**Comportamento:**

- Dopo che `checkFiles` ritorna OK e (se richiesto) DB è inizializzato, stampare:

```text
✓ worker.ts
✓ wrangler.jsonc
✓ seeds.ts
✓ Local D1 system tables ready

Next steps:
1. npx beech seed:load --local   # create content tables
2. npx wrangler dev              # start API + dashboard
3. Open http://localhost:8789/admin to finish setup
```

---

## Phase 1.5 – Success Indicators & Dashboard Checklist

### Obiettivo

Dare al dev un feedback visivo chiaro che il setup è corretto e cosa manca per arrivare al primo contenuto pubblicato.

### Implementazioni

#### 1. Widget “Project Health / Checklist” nel Dashboard

**File:** `apps/dashboard/src/features/dashboard/...` (nuovo widget).  

**Stato mostrato:**

- ✓ System tables presenti (derivato da una chiamata API tipo `/api/stats` o reuse di existing).[file:1]
- ✓ Seeds registrati (N seeds in registry).[file:1]
- ✓ Content tables create (check `beech seed:load` eseguito – p.es. confrontando seeds vs tabella).  
- ⏳ Admin account creato (true/false da endpoint setup).[file:1]
- ⏳ Almeno 1 entry per il seed principale (es. `posts`) – se `--with-examples`, sarà già OK.

**Azioni rapide:**

- Link a `seeds.ts`.
- Link a “Create your first post”.
- Link alla doc “Next steps”.

---

## Phase 2 – Configurazione Seeds & Validazione

### Flow Attuale

- Developer modifica `seeds.ts` usando `defineSeed` e `Seed` di `beechcms/core`.[file:1]
- `npx beech seed:load --local` compila i Seeds in SQL (`generateCreateTable`, ecc.) e applica DDL a D1 locale/remoto.[file:1]

### Problemi Attuali

- Nessuna validazione preventiva dei Seeds (duplicati, displayNameAlias sbagliato, slug duplicati, ecc.).[file:1]
- Placeholder in `wrangler.jsonc` causando errori tardivi (già gestiti sopra).[file:1]
- `seed:load --dry-run` esiste ma non è messo in evidenza.[file:1]

### Implementazioni

#### 1. `beech validate` – Validazione Seeds

**File:** `packages/cli/src/commands/validate.ts`.  

**Input:** opzionale `--registry` come in `seed:load` (default `SEED_REGISTRY`).[file:1]

**Step:**

1. Caricare i Seeds con lo stesso loader di `seed:load` (`tryLoadLocalRegistry()` o analogo).[file:1]
2. Eseguire controlli:
   - Duplicati `id` (se ancora presenti in qualche forma legacy) dentro un Seed.
   - Duplicati `alias` dentro un Seed.[file:1]
   - Duplicati `slug` tra Seeds.[file:1]
   - `displayNameAlias` che punta a un branch inesistente.[file:1]
3. Output strutturato, es.:

```text
✓ posts
✗ articles — duplicate branch alias: "title"
✗ products — displayNameAlias "name" not found

Found 2 invalid seeds.
```

4. Exit code:
   - 0 se nessun errore.
   - 1 se almeno un errore (usabile in CI).

#### 2. Auto-validate in `beech seed:load`

**File:** `packages/cli/src/commands/seed-load.ts`.[file:1]

- All’inizio del comando:
  - Eseguire la stessa validazione di `beech validate`.
  - Se errori:
    - Stampare warning ma **non** bloccare `seed:load` (per retrocompatibilità), p.es.:

```text
⚠ Seed validation found issues. Schema changes will still be applied.

Run "npx beech validate" for details.
```

- Opzionale: flag `--strict` per bloccare in caso di errori.

#### 3. Wizard CLI `beech seed:create`

**Nuovo comando:** `packages/cli/src/commands/seed-create.ts`.  

**Comportamento:**

- Wizard interattivo che genera/modifica `seeds.ts`:
  - "Name of the content type (singular)?" → `label`.
  - "Slug (press enter to use auto-generated)" → `slug`.
  - Loop: "Add field?" → type, alias, label, opzioni (required, policies base).
- Output:
  - Aggiunta di un nuovo `defineSeed(...)` in `seeds.ts` con:
    - `displayNameAlias` settato alla prima field di tipo `text` o `name`.
    - `dashboard` base (icon generica, group “Content”).

**Nota:** il wizard deve manipolare file TypeScript esistenti preservando formatting quanto possibile (preferibile usare AST via `ts-morph` o parsing semplice se troppo complesso).

#### 4. Sample Data – Opzione `--with-examples`

**Scaffolder:** `create.mjs` o script equivalente (quello che implementa `npm create @beechcms/cms`).[file:1]

- Aggiungi opzione wizard:
  - “Do you want example content types and demo entries?” (Yes/No).
- Se Yes:
  - `seeds.ts` generato con un Seed `posts` simile a quello della doc.[file:1]
  - Script seed-initial-content (es. `apps/api/src/seed-demo.ts` o usare CLI) per inserire 2–3 row base.
  - Opzionalmente, eseguire automaticamente `beech seed:load --local` e creazione delle entries.

---

## Phase 3 – Sviluppo & API Learning

### Flow Attuale

- `wrangler dev` su 8789 + server frontend (es. Next) su 3000.[file:1]
- Public API:
  - `GET /api/v1/public/:slug` (read, con `PUBLIC_READ_API_KEY`).[file:1]
  - `POST /api/v1/public/:slug/add` (form, con `PUBLIC_WRITE_API_KEY`).[file:1]

### Problemi Attuali

- CORS bloccano la prima richiesta (default `CORS_ORIGINS` con solo 5173/5174).[file:1]
- Nessun endpoint di introspezione pubblica, solo `/api/schema` autenticato.[file:1]
- Le API key sono “nascoste” in `wrangler.jsonc`, non ricordate a schermo.[file:1]

### Implementazioni

#### 1. CORS: auto-allow `localhost:*` in dev

**File:** `apps/api/src/factory.ts` (dove viene creato `Hono` + middleware CORS).[file:1]

**Logica:**

- Se `context.env.ENV !== 'production'` **oppure** `ENV` non settata:
  - Permettere qualsiasi `origin` che matcha:
    - `http://localhost:*`
    - `http://127.0.0.1:*`
- In produzione usare ancora `CORS_ORIGINS` da `wrangler.jsonc`.[file:1]

**Esempio:**

```ts
const isDev = context.env.ENV !== 'production';

const corsOptions = isDev
  ? { origin: (origin) => isLocalhost(origin) ? origin : '' }
  : { origin: context.env.CORS_ORIGINS.split(',') };
```

#### 2. Endpoint pubblico `/api/v1/public/schema`

**File:** `apps/api/src/features/schema/schema.handler.ts` (o nuovo feature “public-schema”).[file:1]

**Endpoint:**

- `GET /api/v1/public/schema` (JSON):
  - Accesso:
    - Local-only **oppure**
    - Protetto via `PUBLIC_READ_API_KEY` (anche in produzione).
  - Ritorna:
    - Lista Seeds con `allowPublicRead === true` o `allowPublicPost === true`.[file:1]
    - Per ogni Seed: `slug`, `labelPlural`, `branches` con `alias`, `type`, `label`, `policies.public`.[file:1]
- (Estensione) `GET /api/v1/public/schema.html`:
  - Render HTML semplice con sezione per Seed, per consultazione rapida da browser.

**Scopo:**

- Base per generazione SDK client-side.
- Documentazione inline per il developer che integra il frontend.

#### 3. Output `beech init`: API key echo

**File:** `packages/cli/src/commands/init.ts`.[file:1]

**Logica:**

- Dopo `checkFiles` e verifica `wrangler.jsonc`, leggere `vars`:
  - `PUBLIC_READ_API_KEY`
  - `PUBLIC_WRITE_API_KEY`
- Se presenti e non placeholder, stampare:

```text
API keys detected in wrangler.jsonc:

- PUBLIC_READ_API_KEY  = <****>
- PUBLIC_WRITE_API_KEY = <****>

Use these in your frontend as the X-API-Key header.
```

(Offusca il valore completo se necessario, ma è già nel repo locale.)

---

## Phase 4 – Deploy

### Flow Attuale

- Deploy: `npm run deploy` → `wrangler deploy` + migrazioni sistema.[file:1]
- `npx beech seed:load` → sync schema Seeds su DB remoto.[file:1]
- Setup wizard `/admin` per prima configurazione account.[file:1]

### Problemi Attuali

- Dipendenza d’ordine non chiarissima: se `seed:load` viene eseguito prima del deploy, DB remoto non c’è ancora → errore wrangler poco chiaro.[file:1]
- Se `database_id` sbagliato, migrazioni D1 non girano ma deploy “passa” e `/admin` mostra 500.[file:1]

### Implementazioni

#### 1. `beech init --db --remote` come verifica post-deploy

**File:** `packages/cli/src/commands/init.ts` (già supporta `local/remote`).[file:1]

**Comportamento:**

- Se chiamato con `--remote`:
  - Usa `resolveDbName` + `--remote` su wrangler per interrogare il DB D1 remoto.[file:1]
  - Verifica presenza di tutte le `SYSTEM_TABLES` già definite nel file (es. `users`, `analytics`, ecc.).[file:1]
  - Output:

```text
Checking remote database "my-project-db"...

✓ users
✓ refreshtokens
✓ mediaobjects
...

All system tables present. Remote database is initialized.
```

- Se mancano tabelle:

```text
⚠ Missing system tables: users, mediaobjects

Most likely causes:
- Wrong database_id in wrangler.jsonc
- Migrations did not run during deploy

Fix the configuration and re-deploy:

  1. Update wrangler.jsonc d1.databases.database_id
  2. Run: npm run deploy
```

#### 2. `beech deploy` wrapper

**Nuovo comando:** `packages/cli/src/commands/deploy.ts`.

**Comportamento:**

1. `npm run deploy` (wrangler deploy).
2. `npx beech seed:load` (remote, default).[file:1]
3. Chiamata HTTP HEAD/GET a `/admin` (via `APP_URL` o Worker URL) per verificare status 200/302.
4. Output:

```text
✓ Worker deployed
✓ Content schema synced
✓ Admin reachable at: https://my-project-api.workers.dev/admin
```

**Error handling:**

- Se `/admin` restituisce 500:
  - Suggerire `beech init --db --remote` come passo successivo.

---

## Phase 5 – Maintenance & Upgrade

### Flow Attuale

- Aggiornamento manuale pacchetti:
  - `npm i @beechcms/api@latest @beechcms/core@latest`.[file:1]
- `beech seed:diff --local` già disponibile per confrontare Seeds vs schema DB.[file:1]
- `beech seed:load` è additive-only (non droppa colonne).[file:1]

### Problemi Attuali

- Nessun `beech update` che guida l’update.
- Il dev non ha indicazioni chiare su colonne orfane.
- `seed:diff --local` non è comunicato come health check “daily”.[file:1]

### Implementazioni

#### 1. `beech update`

**File:** `packages/cli/src/commands/update.ts`.

**Comportamento:**

1. Eseguire:

   ```bash
   npm install @beechcms/api@latest @beechcms/core@latest
   ```

2. `npx beech init --db --local` per applicare eventuali nuove migrazioni di sistema in locale.[file:1]
3. Stampare:

   ```text
   Local update complete.

   Next steps:
   1. npx beech seed:load --local   # sync content schema
   2. npm run deploy                 # deploy API + dashboard
   3. npx beech seed:load            # sync remote schema
   ```

#### 2. `beech seed:diff` – colonne orfane

**File:** `packages/cli/src/lib/schema-diff.ts` + `seed-load`.[file:1]

**Enhancement:**

- Attualmente `diffSeed` ritorna `status` per colonne: `ok`, `missing`, `extra`, `typemismatch`.[file:1]
- Estendere l’output CLI:
  - `extra` → mostrarle come “orphaned” con spiegazione:

```text
content_posts
  extra column: "oldField" (type TEXT)  → orphaned (exists in DB but not in seeds.ts)
```

- Documentare esplicitamente che Beech **non** droppa mai colonne automaticamente.

#### 3. Doc “Schema evolution” + “Daily workflow”

**File:** `docs/guide.md`.[file:1]

- Aggiungere sezioni:

  - **Schema evolution**
    - `beech seed:load` aggiunge solo colonne/tabelle (non droppa).
    - Se rimuovi un branch, la colonna rimane; decidi tu se fare un `ALTER TABLE DROP COLUMN` manuale.
    - Usa `beech seed:diff` per identificare colonne orfane.
  - **Daily workflow**
    - Dopo git pull:
      - `npm install` (se necessario).
      - `npx beech seed:load --local`.
      - `npx beech seed:diff --local` come health check.

---

## Cross-Cutting – Error DX Upgrade

### Obiettivo

Standardizzare il formato degli errori CLI in modo che siano:

1. Brevi ma chiari (una riga).
2. Spiegano la causa probabile.
3. Forniscono sempre un comando suggerito.

### Linee Guida

Per tutti i comandi CLI (`init`, `seed:load`, `validate`, `update`, `deploy`):

- **Formato raccomandato:**

```text
✗ <short error>

<1–2 righe di contesto>

→ Run: <comando 1>
→ Then: <comando 2> (se serve)
```

- Evitare errori nudi di wrangler/npx senza spiegazione.
- Intercettare i casi più comuni:
  - `wrangler d1 execute failed` → tradurre in “Database unreachable / wrong database_id” con suggerimenti.

---

## Cross-Cutting – Telemetria DX (Opzionale, Opt-in)

### Idea

Aggiungere un flag opt-in (`beech telemetry enable`) per raccogliere in forma anonima:

- Tempo medio tra `beech init` e primo successo `seed:load`.
- Errori più frequenti CLI.
- Comandi più utilizzati.

Implementazione dettagliata e backend per la telemetria sono fuori scope immediato, ma il piano dovrebbe prevedere la possibilità futura.

---

## Out of Scope (Confermati)

- UI per definire Seeds (restano code-first).[file:1]
- Secondo runtime target che astragga Cloudflare (rimane Web standard su Workers + D1 + R2).[file:1]
- SDK specifici per framework (Next/Astro/etc.): la REST API + schema endpoint sono il contratto principale.[file:1]

---

## Riepilogo Task per Claude Code (Checklist)

### Phase 1

- [x] Modificare `apps/api/src/upload.ts` per usare `MEDIA_BUCKET` binding in locale.
- [x] Aggiornare `beech init` (`packages/cli/src/commands/init.ts`) con:
  - [x] wrangler `whoami` check.
  - [x] Scan placeholder in `wrangler.jsonc`.
  - [x] Output “Next steps” chiaro dopo successo.
- [x] Aggiornare `create.mjs` per chiarire che `.dev.vars` è solo per produzione (R2 credenziali).

### Phase 1.5
- [x] Aggiungere widget “Project Health / Checklist” in dashboard.
- [x] Collegare widget a un endpoint API di health semplice.

### Phase 2

- [ ] Implementare `beech validate` (`packages/cli/src/commands/validate.ts`).
- [ ] Integrare auto-validate in `beech seed:load`.
- [ ] Implementare `beech seed:create` wizard.
- [ ] Estendere scaffolder per `--with-examples`.

### Phase 3

- [ ] Modificare CORS in `apps/api/src/factory.ts` per auto-allow localhost in dev.
- [ ] Implementare `GET /api/v1/public/schema` (JSON + opzionale HTML).
- [ ] Aggiungere echo di API key in `beech init`.

### Phase 4

- [ ] Rafforzare `beech init --db --remote` come verifica post-deploy.
- [ ] Implementare `beech deploy` wrapper.

### Phase 5

- [ ] Implementare `beech update`.
- [ ] Migliorare output `beech seed:diff` (colonne orfane).
- [ ] Aggiornare `docs/guide.md` con “Schema evolution” e “Daily workflow”.

### Cross-Cutting

- [ ] Rivedere tutti i messaggi di errore CLI secondo il nuovo formato.
- [ ] (Futuro) Progettare struttura minima per telemetria opt-in.

---

## Implementation Notes (per agenti AI — non rifare queste ricerche)

### Mappa file chiave

| Responsabilità | File |
|---|---|
| Upload / serve / delete media | `apps/api/src/upload.ts` |
| Estrazione chiavi R2 da entry data | `apps/api/src/media-utils.ts` |
| CLI entry point (parsing flag) | `bin/cli.mjs` |
| CLI comandi compilati | `packages/cli/src/commands/init.ts`, `seed-load.ts` |
| Wrangler helpers (queryD1, executeD1File, findWranglerConfig, resolveDbName) | `packages/cli/src/lib/wrangler.ts` |
| Scaffolder progetto utente | `bin/create.mjs` |
| Config monorepo API | `apps/api/wrangler.jsonc` |
| Template seeds scaffolding | `bin/templates/*.ts` |
| CORS + Hono factory | `apps/api/src/factory.ts` (Phase 3) |
| Schema handler API | `apps/api/src/features/schema/` (Phase 3) |

### Architettura CLI

- `bin/cli.mjs` è il binario reale (JS puro, no build). Importa da `@beechcms/cli` (= `packages/cli/dist/`).
- `packages/cli/src/` è TypeScript → compila in `packages/cli/dist/` prima di ogni uso in produzione.
- `tryLoadLocalRegistry()` in `cli.mjs` carica `seeds.ts` direttamente con `--experimental-strip-types` (Node 22.6+).
- Tutti i comandi sono **non-interattivi** by design — solo `bin/create.mjs` ha wizard (con `--yes` / `-y` per skip).

### Pattern R2 locale (implementato in Phase 1)

- `isLocal = !env.R2_ACCESS_KEY_ID` — unico switch locale/prod.
- In locale: usa `env.MEDIA_BUCKET` (binding Miniflare, definito in `r2_buckets` di `wrangler.jsonc`).
- In produzione: usa S3 client (`@aws-sdk/client-s3`) con credenziali da `.dev.vars` / wrangler secrets.
- `deleteR2Objects` in locale legge `size_bytes` da D1 `media_objects` (più affidabile dell'HEAD S3).
- `.dev.vars` è ora **opzionale** per lo sviluppo locale.

### Pattern placeholder detection (`beech init`)

Valori placeholder riconosciuti (array `PLACEHOLDER_DB_IDS` in `init.ts`):
- `INCOLLA_QUI_IL_TUO_ID_D1` (monorepo)
- `FILL_IN_YOUR_D1_DATABASE_ID` (scaffolded projects)
- `YOUR_D1_DATABASE_ID`

Aggiungere a questo array se si introduce un nuovo placeholder in `create.mjs` o `wrangler.jsonc`.

### Auth check wrangler (`beech init --db`)

- Check eseguito **solo** per `--remote` (non per `--local`).
- Usa `spawnSync('npx', ['wrangler', 'whoami', '--json'])` — exit code ≠ 0 = non autenticato.
- Check fatto **dopo** il placeholder check (fail fast sul config prima di fare chiamate di rete).

### Stato `.dev.vars` in monorepo

`apps/api/.dev.vars` non è committato (in `.gitignore`). Contiene le credenziali R2 per simulare produzione in locale. Da Phase 1 non è più necessario per il dev workflow base.

### Phase 2 — dipendenze note

- `beech validate` e `beech seed:create` vanno aggiunti come nuovi file in `packages/cli/src/commands/` e registrati in `bin/cli.mjs` (oggetto `COMMANDS`).
- Il loader seeds esistente (`tryLoadLocalRegistry()` in `cli.mjs`) può essere riusato as-is.
- Per `seed:create` wizard: evitare `ts-morph` se possibile (dipendenza pesante) — valutare append testuale con template string su `seeds.ts`.

### Phase 3 — CORS

`apps/api/src/factory.ts` crea l'app Hono. Il middleware CORS si trova lì. Pattern da seguire: `env.ENV !== 'production'` per rilevare dev (già usato in `upload.ts` per i log).

### Phase 3 — Public schema endpoint

`apps/api/src/features/schema/` contiene già handler per `/api/schema` (autenticato). Il nuovo `/api/v1/public/schema` va aggiunto come route separata con accesso via `PUBLIC_READ_API_KEY`.

### Non-interactive per agenti AI

Golden path completo senza prompt:
```bash
npm create @beechcms/cms my-project --yes
cd my-project
npm install
npx beech init --db --local
npx beech seed:load --local
npx wrangler dev
```

Tutti i comandi `beech` escono con code 0 (successo) o 1 (errore). Nessun prompt interattivo.

---

### Logica del widget `SetupChecklistWidget` (Implementata)

- **Tutti i check passano** → mostra barra verde "Project ready" con tasto ✕ (dismiss persistito in `localStorage` con chiave `beech_setup_checklist_dismissed`)
- **Check incompleti** → mostra checklist completa con azioni inline (comandi CLI, link interni, link esterni)
- `staleTime: 30s`, `refetchInterval: 60s` — si aggiorna automaticamente mentre il dev esegue comandi nel terminale
- L'endpoint `/api/content/stats/setup-checklist` è autenticato (come tutti i `/api/content/*`)

### Cosa fare nella prossima sessione

1. [x] **Verificare** che i test passino.
2. [x] **Segnare Phase 1.5 come completata** nella checklist.
3. [x] **Refactoring Storage Abstraction**: Implementazione `BeechBucket`, `MediaRepository` e `SystemStatsRepository`.
4. [x] **Hardening Prod/Dev**: Gestione corretta di CDN, error handling e capability detection.
5. [ ] **Procedere con Phase 2** — `beech validate` è il task più isolato e privo di dipendenze, ottimo punto di partenza.
6. [ ] **Integrare auto-validate** in `beech seed:load`.
7. [ ] **Implementare `beech seed:create`** wizard.
8. [ ] **Estendere scaffolder** per `--with-examples`.
