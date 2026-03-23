# 🏗️ Report Infrastruttura — Beech CMS

> **Data**: 23 Marzo 2026  
> **Versione analizzata**: 0.0.1  
> **Autore**: Infrastructure Maintainer Agent

---

## 📋 Sommario Esecutivo

Beech CMS è un CMS headless con architettura monorepo composta da tre moduli:
- **API** — Cloudflare Workers (Hono + D1 + R2)
- **Dashboard** — React 19 + Vite + TailwindCSS v4 + shadcn/ui
- **Core** — Pacchetto condiviso (`@beech/core`, "Botanical Engine")

L'architettura è solida nelle scelte tecnologiche (edge-first, schema-driven, monorepo con Turborepo), ma presenta **criticità di sicurezza gravi**, **debiti tecnici strutturali** e **lacune operative** che vanno affrontate prima di qualsiasi deploy in produzione.

### Priorità Immediate

| Severità | Problema | Rif. |
|----------|---------|------|
| 🔴 **CRITICO** | Credenziali R2 reali nel file `.dev.vars` tracciato | [§1.1](#11-credenziali-r2-committate-nel-repository) |
| 🔴 **CRITICO** | JWT Secret hardcoded in `wrangler.jsonc` | [§1.2](#12-jwt-secret-hardcoded-in-wranglerjsonc) |
| 🟠 **ALTO** | Access token in `localStorage` (vettore XSS) | [§1.3](#13-access-token-jwt-in-localstorage) |
| 🟠 **ALTO** | Nessuna autorizzazione RBAC nell'API | [§1.4](#14-assenza-di-rbac-role-based-access-control) |
| 🟡 **MEDIO** | Nessun CD pipeline / processo di deploy automatico | [§3.1](#31-assenza-di-continuous-deployment) |
| 🟢 **RISOLTO** | Componente monolite `content-toolbar.tsx` (ex 46 KB) | [§2.1](#21-componente-monolite-content-toolbartsx) |

---

## 1. 🔒 Sicurezza

### 1.1 Credenziali R2 Committate nel Repository

> [!CAUTION]
> Il file `apps/api/.dev.vars` contiene credenziali R2 **reali** (Access Key ID, Secret Access Key, Endpoint con Account ID) ed è **visibile nel repository Git**. Anche se `.dev.vars` è menzionato nel `.gitignore`, il file è attualmente presente nel working tree e potenzialmente nell'history Git.

**File**: `apps/api/.dev.vars`
```
R2_ACCESS_KEY_ID=e6ad04a676dc6abf84e02025879304c7
R2_SECRET_ACCESS_KEY=6006a5328f3e6c147323b8c0e4a7fd478e27d7f79f317cb6a53f103a593f3d2b
R2_ENDPOINT=https://15f23625432b9405c23cc1caebe0d48a.r2.cloudflarestorage.com
```

**Rischio**: Chiunque abbia accesso al repository (compresi fork, CI logs, backup) può leggere e utilizzare le credenziali per accedere, modificare o cancellare file nel bucket R2.

**Azione richiesta**:
1. **Ruotare immediatamente** le credenziali R2 nella Cloudflare Dashboard
2. Verificare che `.dev.vars` sia effettivamente nel `.gitignore` e mai committato
3. Se già committato, rimuovere dall'history con `git filter-branch` o `BFG Repo-Cleaner`
4. Utilizzare `.dev.vars.example` (già presente) come template con valori fittizi

---

### 1.2 JWT Secret Hardcoded in `wrangler.jsonc`

> [!WARNING]
> Il file `wrangler.jsonc` contiene un JWT_SECRET in chiaro nelle variabili d'ambiente: `"JWT_SECRET": "sviluppo-secret-cambiami"`.

**File**: `apps/api/wrangler.jsonc` (riga 40)

Anche se il valore è palesemente un placeholder di sviluppo, il pattern è pericoloso perché:
- Se usato in produzione senza override, **tutti i JWT possono essere forgiati**
- Il file è committato e visibile pubblicamente

**Azione richiesta**:
1. Rimuovere `JWT_SECRET` dalle `vars` nel `wrangler.jsonc`
2. Configurare via `wrangler secret put JWT_SECRET` per la produzione
3. Per sviluppo locale, utilizzare `.dev.vars` (non committato)
4. Documentare la procedura di setup segreti nel README

---

### 1.3 Access Token JWT in `localStorage`

**File**: `apps/dashboard/src/lib/api.ts`

L'access token JWT è salvato in `localStorage` (chiave `beech_token`). Questo lo espone ad attacchi **XSS**: qualsiasi script malevolo iniettato nella pagina può leggere il token.

**Stato attuale**: il team ne è consapevole (c'è un `TODO(security)` nel codice), ed il refresh token usa correttamente i cookie `httpOnly`.

**Mitigazione attuale**: La CSP header `default-src 'self'` limita l'esecuzione di script esterni, ma non protegge da XSS stored o DOM-based.

**Raccomandazione**: Valutare una architettura BFF (Backend For Frontend) dove l'access token risiede in un cookie `httpOnly` con `SameSite=Strict`, eliminando completamente l'esposizione a XSS.

---

### 1.4 Assenza di RBAC (Role-Based Access Control)

> [!IMPORTANT]
> Il database definisce un campo `role` nella tabella `users` (`'admin'` o `'editor'`), ma **il middleware API non lo verifica** mai. Tutte le rotte protette controllano solo la `validità del JWT`, non il ruolo dell'utente.

**Impatto**: Qualsiasi utente autenticato (anche `editor`) ha **accesso completo** a tutte le operazioni CRUD, inclusa la cancellazione di contenuti e upload di file.

**Azione richiesta**:
1. Includere il campo `role` nel payload JWT
2. Creare middleware di autorizzazione (es. `requireRole('admin')`)
3. Proteggere le rotte sensibili (DELETE, gestione utenti futura) con il middleware appropriato

---

### 1.5 Migrazione Init con `DROP TABLE IF EXISTS`

**File**: `apps/api/migrations/0001_init.sql`

```sql
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS content_entries;
```

Questo è **estremamente pericoloso** in produzione: rieseguire accidentalmente la migrazione cancellerebbe tutte le tabelle.

**Azione richiesta**: Sostituire con `CREATE TABLE IF NOT EXISTS` e gestire lo schema via migrazioni incrementali idempotenti.

---

### 1.6 Password Admin di Test nel Seed

**File**: `apps/api/migrations/0002_seed_admin.sql`

La migrazione contiene un utente admin con password conosciuta (`password123`). Se eseguita in produzione, crea un accesso prevedibile.

**Raccomandazione**: Separare i dati di seed (sviluppo/test) dalle migrazioni di schema (produzione). Utilizzare seed condizionali (`ENV=development`).

---

### 1.7 Altre Osservazioni di Sicurezza

| Area | Stato | Note |
|------|-------|------|
| **CORS** | ✅ Buono | Whitelist configurabile, no fallback permissivo |
| **Security Headers** | ✅ Buono | X-Frame-Options, CSP, nosniff, Permissions-Policy |
| **Rate Limiting** | ✅ Buono | Login (5/60s) e Refresh (20/60s) con chiave IP+email |
| **Timing Attack** | ✅ Buono | `DUMMY_PASSWORD_HASH` per constant-time comparison |
| **Refresh Token** | ✅ Buono | Hashed (SHA-256), rotazione, revoca, httpOnly cookie |
| **SQL Injection** | ✅ Buono | Prepared statements con bind ovunque |
| **File Upload** | ✅ Buono | MIME whitelist, limit 5MB, nome sanitizzato |
| **Token Scaduti** | ⚠️ Mancante | Nessun job di cleanup dei refresh token scaduti/revocati |
| **Audit Log** | ⚠️ Mancante | Nessun log di operazioni CRUD (chi ha fatto cosa) |
| **HTTPS Enforcement** | ⚠️ Parziale | Cookie `secure` è condizionale sulla URL, ok per Workers ma non esplicito |

---

## 2. 🧱 Manutenibilità e Qualità del Codice

### 2.1 Componente Monolite `content-toolbar.tsx` (RISOLTO)

**File**: `apps/dashboard/src/components/content-toolbar/`

**Stato Attuale:** Il componente monolitico da 46KB è stato refattorizzato separando la logica di stato e i sotto-componenti UI (view switcher, menu settings, logic hook dedicati). Tutta la struttura si trova ora nella cartella `content-toolbar/`.

Un singolo file di questa dimensione indica un componente con troppe responsabilità. Questo crea:
- Difficoltà nella revisione del codice e debugging
- Rischio di merge conflict elevato
- Scarsa riutilizzabilità dei sottosistemi

C'è una directory `content-toolbar/` (con 6 file) che suggerisce un refactoring parzialmente iniziato ma mai completato.

**Raccomandazione**: Completare lo split del componente nella directory `content-toolbar/`, separando toolbar, filtri, ricerca, paginazione e bulk actions.

---

### 2.2 Pagina `content-list.tsx` e `entry-editor.tsx`

| File | Dimensione |
|------|-----------|
| `content-list.tsx` | 26 KB |
| `entry-editor.tsx` | 21 KB |

Anche questi file sono molto grandi. Estrattere i sotto-componenti (tabella, dialogs, form sections) in file separati migliorerebbe leggibilità e testabilità.

---

### 2.3 Tipi Duplicati tra API e Dashboard

Le definizioni di tipo per `Bindings`, `Variables`, `ContentEntry` sono **duplicate** tra:
- `apps/api/src/index.ts` (righe 28-46)
- `apps/api/src/content.ts` (righe 230-241)
- `apps/api/src/upload.ts` (righe 16-28)

**Raccomandazione**: Centralizzare i tipi condivisi in `@beech/core` o in un file `types.ts` dedicato nell'API.

---

### 2.4 Uso di `any` Pervasivo in `content.ts`

Le funzioni `buildSqlCondition`, `buildWhereClause`, `buildOrderClause`, `parseFilterGroup`, e `parseCondition` accettano parametri tipizzati come `any`, vanificando i benefici di TypeScript.

**Raccomandazione**: Sostituire `any` con le interfacce già definite (`QueryFilterGroup`, `QueryFilterCondition`, etc.) per la massima type-safety.

---

### 2.5 Schema Hardcoded nel Core Package

Il `SEED_REGISTRY` in `packages/core/src/seeds.ts` definisce tutti gli schemi di contenuto **direttamente nel codice**. Per aggiungere un nuovo tipo di contenuto serve:
1. Modificare il codice sorgente
2. Ricompilare il pacchetto `@beech/core`
3. Ridistribuire API e Dashboard

**Nota**: Questa è una scelta architetturale consapevole documentata nel progetto ("Botanical Engine"), ma per un CMS destinato a utenti non tecnici, sarà necessario un meccanismo per definire gli schemi tramite la Dashboard o file di configurazione.

---

### 2.6 TODO non Tracciati

| Posizione | TODO |
|-----------|------|
| `content.ts:329-332` | Server-side pagination (duplicato) |
| `engine.ts:11-14` | Validazione Zod per payload |
| `api.ts:10-12` | Strategia cookie-only per access token |

**Raccomandazione**: Trasferire i TODO in issue tracker (GitHub Issues) per visibilità e prioritizzazione.

---

## 3. ⚙️ Infrastruttura e DevOps

### 3.1 Assenza di Continuous Deployment

Il progetto ha **3 workflow CI** su GitHub Actions:
1. `test.yml` — Unit test su push/PR a `master`/`devs`
2. `sonarcloud.yaml` — Analisi qualità codice
3. `semgrep.yml` — Scansione sicurezza su PR

Ma **non esiste un pipeline di deploy** (CD). Il deploy avviene manualmente via `wrangler deploy`.

**Rischi**:
- Deploy inconsistenti tra sviluppatori
- Nessun controllo di qualità pre-deploy
- Nessuna strategia di rollback automatico

**Raccomandazione**: Aggiungere un workflow CD che:
1. Esegua build + test
2. Esegua `wrangler deploy` con `CLOUDFLARE_API_TOKEN` da GitHub Secrets
3. Si attivi solo su merge in `master`
4. Includa deploy della dashboard (Cloudflare Pages o hosting appropriato)

---

### 3.2 Database D1: Configurazione Incompleta

**File**: `wrangler.jsonc`
```jsonc
"database_id": "INCOLLA_QUI_IL_TUO_ID_D1"
```

Il database_id è un placeholder. Questo significa che:
- Non si può deployare in produzione senza modifica manuale
- La configurazione di produzione non è documentata o automatizzata

**Raccomandazione**: Documentare il processo di provisioning D1 nel README e valutare variabili d'ambiente per ambienti multipli (staging/production).

---

### 3.3 Migrazione Script `db:migrate:local`

```json
"db:migrate:local": "wrangler d1 execute beech-db --local --file=./migrations/0001_init.sql && ..."
```

Lo script concatena manualmente ogni file di migrazione con `&&`. Questo:
- Non è scalabile (ogni nuova migrazione richiede modifica del comando)
- Non traccia quali migrazioni sono già state eseguite
- Rischia di rieseguire migrazioni distruttive (vedi §1.5)

**Raccomandazione**: Adottare un migration runner (es. esecuzione sequenziale con tracking in tabella `_migrations`).

---

### 3.4 Assenza di Monitoring e Alerting

Non esiste alcun sistema di:
- **Health check** endpoint
- **Uptime monitoring**
- **Error tracking** (Sentry, LogFlare, etc.)
- **Performance monitoring** (latenza API, tempo di risposta DB)
- **Alerting** per errori 5xx o anomalie

**Raccomandazione minima**: Aggiungere un endpoint `/health` che verifichi la connettività D1 e configurare un monitor esterno (Uptime Robot, Better Uptime).

---

### 3.5 Assenza di Logging Strutturato

L'API usa `console.error` e `console.warn` per il logging. In produzione su Cloudflare Workers:
- I log sono disponibili solo in tempo reale via `wrangler tail`
- Non c'è persistenza dei log
- Non c'è correlazione tra richieste

**Raccomandazione**: Integrare un servizio di logging (Logpush, LogFlare, o Axiom per Workers).

---

## 4. 🏛️ Architettura

### 4.1 Panoramica Architetturale

```
┌─────────────────────────────────────────────────────┐
│                     MONOREPO                        │
│              (npm workspaces + Turborepo)            │
│                                                     │
│  ┌──────────────┐  ┌───────────┐  ┌──────────────┐ │
│  │  apps/api     │  │ packages/ │  │ apps/        │ │
│  │              │  │  core     │  │  dashboard   │ │
│  │ Hono (CF     │◄─┤           ├──►│ React 19    │ │
│  │  Workers)    │  │ @beech/   │  │ Vite 7      │ │
│  │              │  │  core     │  │ TailwindCSS  │ │
│  │ D1 (SQLite)  │  │           │  │ shadcn/ui   │ │
│  │ R2 (S3 API)  │  │ Types     │  │ TanStack    │ │
│  │ JWT + bcrypt │  │ Engine    │  │ Tiptap      │ │
│  │ Rate Limit   │  │ Seeds     │  │ Axios       │ │
│  └──────────────┘  └───────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────┘
```

### 4.2 Punti di Forza

- **Edge-first**: L'API gira su Cloudflare Workers (edge), garantendo bassa latenza globale
- **Botanical Engine**: Il pattern alias↔ID decoupling è elegante e protegge dalle breaking change di schema
- **Auth ben progettata**: Refresh token rotation, timing attack mitigation, rate limiting sono implementati correttamente
- **Monorepo condiviso**: Il pacchetto `@beech/core` evita duplicazioni di tipo e logica tra frontend e backend
- **Security Headers**: CSP, X-Frame-Options, nosniff, Permissions-Policy tutti presenti
- **CI automata**: Test, SonarCloud e Semgrep su ogni PR

### 4.3 Punti Deboli

- **Single-tenant rigido**: Un'API, un DB, un bucket — non c'è multi-tenancy
- **Nessun caching**: Nessuna cache lato API (KV, Cache API) per contenuti letti frequentemente
- **Nessun API versioning**: Le rotte non hanno prefisso di versione (`/v1/`)
- **Nessuna public API**: Tutti i contenuti richiedono JWT. Per un CMS headless serve un layer di lettura pubblico
- **Assenza di soft-delete**: Le entry vengono eliminate definitivamente (DELETE dal DB + R2)
- **Nessun sistema di revisioni**: Per un CMS, la storia delle modifiche è fondamentale

---

## 5. 🧪 Testing

### 5.1 Stato Attuale

**API**: 4 file di test — `auth.test.ts` (16 KB), `content.test.ts` (28 KB), `upload.test.ts` (7 KB), `media-utils.test.ts` (2 KB).

La copertura dei test API è buona per le funzionalità implementate.

**Dashboard**: Directory `test/` con 2 file, dimensione da verificare. La dashboard ha una test coverage presumibilmente bassa per un'app con 71 componenti.

**Core**: Nessun file di test visibile.

### 5.2 Lacune

| Area | Stato |
|------|-------|
| Test API (unit) | ✅ Presenti |
| Test Dashboard (unit) | ⚠️ Minimi |
| Test Core (unit) | ❌ Assenti |
| Test E2E | ❌ Assenti |
| Test di integrazione | ❌ Assenti |
| Coverage CI | ⚠️ Disponibile ma non enforced |

**Raccomandazione**: Aggiungere test per `@beech/core` (funzioni `apiToDb`/`dbToApi`) e test E2E per il flusso critico (login → lista → crea → modifica → elimina).

---

## 6. 📊 Riepilogo delle Azioni Prioritizzate

### 🔴 Azione Immediata (entro 24h)
1. **Ruotare le credenziali R2** e rimuovere `.dev.vars` dalla storia Git
2. **Rimuovere `JWT_SECRET`** da `wrangler.jsonc`, migrare a `wrangler secret` / `.dev.vars`

### 🟠 Breve Termine (entro 2 settimane)
3. Implementare **RBAC middleware** per le rotte API
4. Riscrivere `0001_init.sql` con `CREATE IF NOT EXISTS` (no `DROP TABLE`)
5. Separare seed di sviluppo dalle migrazioni di produzione
6. Aggiungere endpoint `/health` e monitoring esterno
7. Aggiungere **CD pipeline** (GitHub Actions → `wrangler deploy`)

### 🟡 Medio Termine (entro 1-2 mesi)
8. Refactoring `content-toolbar.tsx` (split in componenti)
9. Centralizzare tipi duplicati nell'API
10. Sostituire `any` con tipi appropriati in `content.ts`
11. Aggiungere test per `@beech/core`
12. Implementare logging strutturato
13. Aggiungere job di cleanup per refresh token scaduti/revocati
14. Trasferire TODO in GitHub Issues

### 🔵 Lungo Termine (roadmap)
15. Valutare strategia cookie-only per access token (BFF pattern)
16. Implementare API versioning (`/v1/`)
17. Aggiungere un layer di lettura pubblica (senza auth) per il CMS headless
18. Implementare caching con Cloudflare KV o Cache API
19. Aggiungere sistema di audit log
20. Implementare soft-delete e revisioni per i contenuti
21. Valutare migration runner automatizzato

---

## 📎 File Analizzati

<details>
<summary>Elenco completo dei file esaminati durante l'analisi</summary>

**Root**
- `package.json`, `turbo.json`, `tsconfig.json`, `.gitignore`, `sonar-project.properties`

**API** (`apps/api/`)
- `package.json`, `wrangler.jsonc`, `tsconfig.json`, `vitest.config.ts`
- `src/index.ts`, `src/middleware.ts`, `src/content.ts`, `src/upload.ts`, `src/media-utils.ts`
- `src/auth/login.ts`, `src/auth/refresh.ts`, `src/auth/constants.ts`
- `.dev.vars`, `.dev.vars.example`
- `migrations/0001_init.sql` – `migrations/0008_seed_content_entries.sql`

**Dashboard** (`apps/dashboard/`)
- `package.json`, `vite.config.ts`, `eslint.config.js`, `index.html`
- `src/App.tsx`, `src/main.tsx`, `src/lib/api.ts`, `src/lib/content-api.ts`

**Core** (`packages/core/`)
- `package.json`, `tsconfig.json`
- `src/index.ts`, `src/types.ts`, `src/engine.ts`, `src/seeds.ts`

**CI/CD** (`.github/workflows/`)
- `test.yml`, `sonarcloud.yaml`, `semgrep.yml`

</details>
