## 🌳 Beech CMS – System Map

Mappa di alto livello del sistema Beech CMS pensata per onboarding di nuovi contributor e per strumenti di AI. Questo documento riassume **tech stack**, **architettura delle cartelle** e **convenzioni intoccabili** senza entrare nei dettagli di implementazione (coperti dagli altri file in `docs/`).

---

## Tech Stack (con versioni)

- **Frontend (Dashboard)**
  - **React**: `^19.2.0`
  - **React DOM**: `^19.2.0`
  - **TypeScript**: `~5.9.3`
  - **Vite**: `^7.3.1`
  - **Tailwind CSS**: `^4.1.18` (con `@tailwindcss/vite`)
  - **UI & state**
    - `@tanstack/react-query`: `^5.90.21`
    - `@tanstack/react-table`: `^8.21.3`
    - `@tanstack/react-virtual`: `^3.13.23`
    - `next-themes`: `^0.4.6`
    - `lucide-react`: `^0.564.0`
    - Componenti basati su `radix-ui` e shadcn (`shadcn` `^4.0.2`)
  - **Rich text & interazioni avanzate**
    - TipTap (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/pm`): `^3.20.0`
  - **Build & qualità**
    - ESLint 9 (`eslint` `^9.39.1`, `typescript-eslint` `^8.48.0`)
    - Vitest `^3.2.4`, Testing Library (`@testing-library/react`, `@testing-library/jest-dom`)

- **Backend / API**
  - **Runtime**: Cloudflare Workers
  - **Framework HTTP**: `hono` `^4.11.9`
  - **Autenticazione**
    - `jose` `^6.1.3` per JWT
    - `bcryptjs` `^2.4.3` per hashing password
  - **Media / Storage**
    - `@aws-sdk/client-s3` `^3.995.0` per interazione S3-compatibile con Cloudflare R2
  - **Infra & DX**
    - `wrangler` `^4.4.0`
    - Tipi Workers: `@cloudflare/workers-types` `^4.20260213.0`
    - Vitest `^3.2.4` per test sull’API

- **Database & Storage**
  - **Database**: Cloudflare D1 (SQLite edge)
  - **Object Storage**: Cloudflare R2 tramite API S3
  - Modello dati:
    - Tabella unica `content_entries` con metadati SQL + colonna `data` JSON (vedi `[docs/content-engine.md](content-engine.md)`).
    - Tabelle per autenticazione (`users`, `refresh_tokens`) (vedi `[docs/auth.md](auth.md)`).

- **Architettura & Tooling**
  - Monorepo **Turborepo** (`turbo` `^2.8.7`) con **npm workspaces**
  - TypeScript a livello di repo (`typescript` `^5.9.3`) con `tsconfig.json` root condiviso
  - Pacchetto condiviso `@beech/core` (versione `0.0.0`) per tipi e Botanical Engine

Per una descrizione narrativa dello stack e delle motivazioni, vedi anche `[docs/README.md](README.md)` (sezione “Tech Stack”).

---

## Architettura delle cartelle

Vista sintetica del monorepo (vedi dettagli in `[docs/monorepo.md](monorepo.md)`):

```text
beech-cms/
├── apps/
│   ├── api/           # API REST (Hono + Cloudflare Workers/D1/R2)
│   └── dashboard/     # Frontend React (Vite + Tailwind + Field Renderers)
├── packages/
│   └── core/          # @beech/core - Botanical Engine e tipi condivisi
├── docs/              # Documentazione architetturale
├── package.json       # Root: workspaces, script Turbo
├── tsconfig.json      # Config TypeScript base
└── turbo.json         # Pipeline Turbo (dev, build, test)
```

### `apps/api` – API REST su Cloudflare Workers

- **Responsabilità principali**
  - Espone le rotte di autenticazione (`/auth/login`, `/auth/refresh`, `/auth/logout`) – vedi `[docs/auth.md](auth.md)`.
  - Espone le rotte di contenuto dinamiche (`/api/content/:slug`, `/api/content/:slug/:id`) – vedi `[docs/content-engine.md](content-engine.md)` e `[docs/botanical-engine.md](botanical-engine.md)`.
  - Espone l’upload media e la distribuzione file (`/api/upload`, `/api/media/:key`) – vedi `[docs/media-engine.md](media-engine.md)`.
- **Integrazioni chiave**
  - Importa tipi e funzioni da `@beech/core` (`getSeed`, `apiToDb`, `dbToApi`, registry Seed).
  - Usa Cloudflare D1 per persistenza (migrata tramite script `db:migrate:local`).
  - Usa Cloudflare R2 per i file binari, salvando in D1 solo gli URL (stringhe) in `data`.
- **File e moduli importanti**
  - Handler CRUD contenuti: `apps/api/src/content.ts` (descritto in `[docs/content-engine.md](content-engine.md)`).
  - Upload e gestione media: `apps/api/src/upload.ts`, `apps/api/src/media-utils.ts` (vedi `[docs/media-engine.md](media-engine.md)`).
  - Autenticazione e gestione token: handler descritti in `[docs/auth.md](auth.md)` con schema DB per `refresh_tokens`.

### `apps/dashboard` – Dashboard React schema-driven

- **Responsabilità principali**
  - UI amministrativa per gestire Seed/Branch e contenuti tramite le API.
  - Rendering schema-driven di form, tabelle, Kanban e viste tramite Field Renderers (vedi `[docs/field-renderers.md](field-renderers.md)`).
  - Strumenti di filtraggio, sort, ricerca e creazione viste tramite `ContentToolbar` (vedi `[docs/dashboard-components.md](dashboard-components.md)`).
- **Struttura UI (estratto)**
  - `apps/dashboard/src/components/content-toolbar.tsx`: componente toolbar per cambiare vista, filtri, sort, ricerca, creazione entry (descritto in `[docs/dashboard-components.md](dashboard-components.md)`).
  - `apps/dashboard/src/components/fields/`: infrastruttura Field Renderers (display/edit per ogni `BranchType`), descritta in `[docs/field-renderers.md](field-renderers.md)`.
    - `FieldDisplay.tsx`, `FieldEdit.tsx`, `registry.ts`, `display/*.tsx`, `edit/*.tsx`.
  - Pagine di editing entry (es. `EntryEditorPage`) che consumano i Field Renderers + `Seed` dal core.
- **Integrazioni chiave**
  - Consuma `@beech/core` per tipi (`Seed`, `Branch`, ecc.) e logica condivisa.
  - Chiama solo le API documentate (`/auth/*`, `/api/content/*`, `/api/upload`, `/api/media/*`).

### `packages/core` – `@beech/core` (Botanical Engine)

- **Responsabilità principali**
  - Definisce la tipizzazione condivisa: `Branch`, `Seed`, `DbPayload`, `ApiPayload`, ecc.
  - Implementa il **Botanical Engine** (`apiToDb`, `dbToApi`) che traduce tra alias API e ID interni – vedi `[docs/botanical-engine.md](botanical-engine.md)`.
  - Mantiene il **Seed Registry** (`SEED_REGISTRY`, `getSeed`, `PROJECT_SEED`) che definisce gli schemi di contenuto.
- **Struttura (da `[docs/botanical-engine.md](botanical-engine.md)` e `[docs/monorepo.md](monorepo.md))**
  - `packages/core/src/index.ts` – barrel export.
  - `packages/core/src/types.ts` – tipi `Branch`, `Seed`, ecc.
  - `packages/core/src/engine.ts` – funzioni `apiToDb`, `dbToApi`.
  - `packages/core/src/seeds.ts` – definizione Seed e registrazione in `SEED_REGISTRY`.
- **Build**
  - Comando `npm run build -w @beech/core` produce `dist/` con JS + `.d.ts`, consumato da `apps/api` e `apps/dashboard`.

### `docs/` – Documentazione architetturale

- Documenti principali:
  - `[README.md](README.md)` – panoramica prodotto e stack.
  - `[monorepo.md](monorepo.md)` – architettura monorepo.
  - `[botanical-engine.md](botanical-engine.md)` – layer alias ↔ ID.
  - `[content-engine.md](content-engine.md)` – Content Engine SQL/JSON.
  - `[media-engine.md](media-engine.md)` – upload e distribuzione media.
  - `[auth.md](auth.md)` – autenticazione JWT + refresh token.
  - `[dashboard-components.md](dashboard-components.md)` – componenti dashboard chiave.
  - `[field-renderers.md](field-renderers.md)` – Registry Pattern per i campi.
  - `[field-types-roadmap.md](field-types-roadmap.md)`, `[field-types-action-plan.md](field-types-action-plan.md)` – roadmap funzionale dei campi.

---

## Flussi chiave

- **Autenticazione (`/auth/*`)** – vedi `[docs/auth.md](auth.md)`
  - Login con `POST /auth/login`:
    - Verifica credenziali con `bcryptjs`, genera JWT via `jose.SignJWT`, genera refresh token UUID.
    - Salva hash del refresh token in D1 (`refresh_tokens`) e imposta cookie httpOnly (`SameSite=Strict`).
  - Refresh con `POST /auth/refresh`:
    - Legge il cookie `refresh_token`, valida su D1, ruota token (revoca il precedente, genera nuovo token + cookie).
  - Logout con `POST /auth/logout`:
    - Revoca il refresh token a DB e cancella il cookie.

- **CRUD contenuti (`/api/content/:slug`)** – vedi `[docs/content-engine.md](content-engine.md)` + `[docs/botanical-engine.md](botanical-engine.md)`
  - **Scrittura (POST/PUT)**:
    - Request con `data` in formato alias (es. `{ "title": "Progetto X" }`).
    - `getSeed(slug)` dal core → `apiToDb(seed, body)` per mappare alias → `br_xxx`.
    - Serializzazione in `data` (colonna TEXT/JSON) della tabella `content_entries`.
  - **Lettura (GET)**:
    - Lettura riga da D1, `JSON.parse(row.data)` → `dbToApi(seed, data)` per mappare `br_xxx` → alias.
    - Restituisce payload con `data` in formato alias, più metadati (`id`, `schema_slug`, `slug`, `status`, `created_at`, `updated_at`).

- **Media Engine (`/api/upload`, `/api/media/:key`)** – vedi `[docs/media-engine.md](media-engine.md)`
  - Upload:
    - Dashboard chiama `POST /api/upload` con `multipart/form-data` (`file`) e JWT.
    - API valida tipo e dimensione, salva file su R2 con `@aws-sdk/client-s3`, genera URL pubblico relativo (`/api/media/KEY`) o assoluto (`MEDIA_BASE_URL`).
    - Restituisce `{ url }`, che la dashboard salva come stringa nel campo `data[alias]` dell’entry.
  - Servizio media:
    - `GET /api/media/:key` recupera il file da R2 e lo restituisce con caching aggressivo.
  - Cleanup:
    - In `DELETE /api/content/:slug/:id`, l’API ispeziona `data` per URL `/api/media/*` (tramite util in `media-utils.ts`) e invia `DeleteObjectCommand` a R2.

- **Rendering dashboard schema-driven** – vedi `[docs/field-renderers.md](field-renderers.md)` e `[docs/dashboard-components.md](dashboard-components.md)`
  - `EntryEditorPage`:
    - Carica `Seed` (via API + core) e per ogni `Branch` renderizza:
      - `<FieldEdit branch={branch} value={...} onChange={...} />`
      - Il tipo concreto è risolto dal registry (`registry.ts`), non dalla pagina.
  - Table/Grid/Kanban views:
    - Generano le colonne dinamicamente a partire da `Seed.branches`.
    - Usano `<FieldDisplay>` per ogni cella, con `options.maxLength` per troncamenti.
  - `ContentToolbar` (file `content-toolbar.tsx`):
    - Gestisce viste utenti (`UserViewInstance`), strumenti (`filter`, `sort`, `automation`, `search`, `settings`, `create`) e filtri Notion-like.

---

## Convenzioni intoccabili

- **Schema-driven ovunque**
  - **Si deve** usare sempre `Seed`/`Branch` e il Botanical Engine (`apiToDb`, `dbToApi`) per leggere/scrivere `data`.
  - **Non si deve** accedere a `data` direttamente tramite alias hard-coded o chiavi DB (`br_xxx`) all’interno dell’API o della Dashboard.

- **Monorepo & codice condiviso**
  - **Si deve** mettere la logica e i tipi condivisi in `@beech/core` (`packages/core`) e consumarli da `apps/api` e `apps/dashboard`.
  - **Non si deve** duplicare tipi, funzioni di traduzione o definizioni Seed all’interno delle app.

- **API di contenuto centralizzate**
  - **Si deve** usare esclusivamente le rotte dinamiche `POST/GET/PUT/DELETE /api/content/:slug[/id]` per manipolare i contenuti.
  - **Non si deve** creare controller per-tipo (es. `/api/projects`, `/api/blog`) che bypassano il Content Engine o il Seed Registry.

- **Autenticazione e sicurezza**
  - **Si deve** usare il flusso JWT + refresh token descritto in `[docs/auth.md](auth.md)` con:
    - Access token breve (15 minuti) via `jose`.
    - Refresh token opaco salvato hashato in D1 (`refresh_tokens`).
    - Cookie httpOnly `SameSite=Strict`, rotazione token e rate limiting.
  - **Non si deve**:
    - Salvare token in chiaro nel DB.
    - Introdurre sessioni custom non documentate o bypassare il rate limiting.

- **UI schema-driven e Field Renderers**
  - **Si deve** usare `FieldDisplay`/`FieldEdit` e il registry in `apps/dashboard/src/components/fields` per visualizzare e modificare i campi.
  - **Non si deve** scrivere UI che fa `switch` sul tipo manualmente nelle viste (Table, Form, Kanban, ecc.).

- **Gestione media**
  - **Si deve**:
    - Usare `POST /api/upload` e salvare solo l’URL nel campo di tipo `file` (stringa).
    - Delegare la cancellazione dei file a `DELETE /api/content/:slug/:id` (che chiama le util di `media-utils.ts`).
  - **Non si deve** caricare file direttamente su R2 dal frontend o salvare blob binari in D1.

- **Qualità e coerenza**
  - **Si deve**:
    - Usare TypeScript in modalità `strict`, seguendo il `tsconfig` root.
    - Usare ESLint/TypeScript-ESLint e Vitest come da configurazione dei singoli package.
  - **Non si deve** introdurre nuove librerie di state management, routing o UI senza aggiornare `SYSTEM_MAP.md` e la documentazione relativa.

---

## Manutenzione del documento

- **Aggiornare lo stack** ogni volta che:
  - Si introduce una nuova tecnologia core (nuovo framework, nuovo DB, nuovo tool CI/CD rilevante).
  - Si aggiorna una dipendenza chiave a una nuova major (React, Vite, Tailwind, Turborepo, Cloudflare Workers API, ecc.).
- **Aggiornare l’architettura delle cartelle** quando:
  - Si aggiunge una nuova app in `apps/` o un nuovo pacchetto in `packages/`.
  - Si spostano responsabilità significative tra moduli (es. estrazione di un nuovo package condiviso).
- **Aggiornare le convenzioni intoccabili** quando:
  - Si prendono decisioni architetturali importanti (nuovi pattern per API, UI, sicurezza).
  - Si fa un refactor che cambia in modo strutturale i flussi descritti in questo documento.

`SYSTEM_MAP.md` è la fonte di verità di alto livello per capire “come è fatto” Beech CMS. I dettagli di implementazione rimangono nei singoli file di `docs/` e nel codice.

