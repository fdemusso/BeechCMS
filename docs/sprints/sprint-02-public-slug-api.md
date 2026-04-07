# Sprint 02 — Generazione Automatica degli Slug (Public API Layer)

> **Documento per:** Agente AI di sviluppo (Claude / Gemini)
> **Tipo:** Prompt di implementazione iterativa
> **Priorità:** Critica — è il cuore della distribuzione pubblica dei contenuti
> **Dipendenze:** Botanical Engine (`@beech/core`), Content Engine (`content.ts`), Auth Middleware (`middleware.ts`)

---

## `<role>`

Sei un **Senior Backend Engineer** specializzato in TypeScript, Cloudflare Workers, Hono e SQLite (D1). Lavori su **Beech CMS** — un CMS headless schema-driven su Cloudflare.

Conosci perfettamente l'architettura del progetto:

- Il **Botanical Engine** (`@beech/core`) traduce alias API ↔ ID interni DB tramite `getSeed`, `apiToDb`, `dbToApi`. **Non accedi mai ai dati con chiavi `br_xxx` direttamente** — usi sempre il translation layer.
- Il **Content Engine** (`apps/api/src/content.ts`) implementa il CRUD completo su `content_entries`, con filtri server-side, paginazione, facets e sanitizzazione JSON.
- L'**Auth Middleware** (`apps/api/src/middleware.ts`) protegge le rotte con JWT (Bearer token, HS256, 15min). Usi lo stesso middleware per proteggere le nuove rotte pubbliche.
- Le API interne del CMS dashboard vivono sotto `/api/content/:slug`. Le nuove **rotte pubbliche** che implementerai vivranno sotto `/api/v1/public/:seed` e sono pensate per essere consumate da siti web frontend, app mobile, o integrazioni esterne.

### Stack tecnico di riferimento

| Componente | Tecnologia | Versione |
|---|---|---|
| Runtime | Cloudflare Workers | — |
| HTTP Framework | Hono | `^4.11.9` |
| Database | Cloudflare D1 (SQLite edge) | — |
| Auth | `jose` (JWT) | `^6.1.3` |
| Pacchetto condiviso | `@beech/core` | `0.0.0` |
| TypeScript | — | `~5.9.3` |

## `</role>`

---

## `<task>`

**Implementa il layer di API pubbliche** (Public Slug API) di Beech CMS. Questo layer espone i contenuti del CMS a consumatori esterni (siti web, app, integrazioni) tramite endpoint REST protetti da API Key.

Il sistema si compone di **tre famiglie di endpoint**:

1. **GET (Lettura)** — Recuperare contenuti con filtri SQL-grade
2. **POST (Aggiunta)** — Inserire nuovi contenuti dal sito al database
3. **PUT (Modifica)** — Aggiornare contenuti esistenti

Ogni endpoint è organizzato attorno al concetto di **Seed** (tipo di contenuto) e ritorna sempre JSON.

## `</task>`

---

## `<context-architecture>`

### File chiave da leggere PRIMA di scrivere codice

| File | Cosa contiene |
|------|---------------|
| `apps/api/src/index.ts` | Entry point Hono — registra rotte `/auth/*`, `/api/content/*`, `/api/upload`. Le nuove rotte `/api/v1/public/*` vanno registrate qui con un middleware di autenticazione dedicato (API Key). |
| `apps/api/src/content.ts` | Handler CRUD interno. Contiene `buildWhereClause`, `buildOrderClause`, `buildSqlCondition`, `rowToEntry`, `parseQueryFilters` — **riusa queste funzioni** dove possibile, non duplicarle. |
| `apps/api/src/middleware.ts` | Auth middleware JWT (Bearer). Per le rotte pubbliche serve un **nuovo middleware** basato su API Key (header `X-API-Key` o query param `?key=`). |
| `packages/core/src/seeds.ts` | `SEED_REGISTRY`, `getSeed(slug)` — usalo per validare che il seed esista. |
| `packages/core/src/engine.ts` | `apiToDb(seed, payload)`, `dbToApi(seed, data)` — traduzione alias ↔ ID interni. |
| `packages/core/src/types.ts` | `Seed`, `Branch`, `BranchType`, `DbPayload`, `ApiPayload`. |

### Struttura database attuale (`content_entries`)

```sql
CREATE TABLE content_entries (
    id TEXT PRIMARY KEY,          -- UUID v4
    schema_slug TEXT NOT NULL,    -- Seed slug (es. 'articoli', 'prodotti')
    slug TEXT,                    -- Slug univoco per entry (es. 'il-mio-articolo')
    status TEXT DEFAULT 'draft',  -- draft | review | published
    data TEXT,                    -- JSON payload ({br_xxx: value})
    created_at INTEGER,           -- Unix timestamp
    updated_at INTEGER            -- Unix timestamp
);
```

### Il Botanical Engine — come funziona (riepilogo)

```
Scrittura: JSON alias → apiToDb(seed, body) → JSON br_xxx → salva in D1
Lettura:   D1 → JSON br_xxx → dbToApi(seed, data) → JSON alias → restituisci
```

**Regola assoluta:** I consumatori della Public API inviano e ricevono **sempre alias** (`title`, `price`). Mai `br_xxx`.

## `</context-architecture>`

---

## `<specification>`

### 0. Autenticazione: API Key Middleware

Prima di implementare gli endpoint, crea il middleware di autenticazione per le rotte pubbliche.

#### Requisiti

- **Variabile d'ambiente:** `PUBLIC_API_KEY` — stringa segreta configurata in `wrangler.jsonc` (dev) o `wrangler secret put` (prod).
- **Verifica:** Il client deve inviare la key tramite header `X-API-Key` **oppure** query param `?key=`.
- **Priorità:** Header ha precedenza sul query param.
- **Risposta errore (401):**

```json
{
  "error": "Unauthorized",
  "message": "Missing or invalid API key. Provide a valid key via X-API-Key header or ?key= query parameter."
}
```

- **Risposta errore (403) — API Key disabilitata/non configurata:**

```json
{
  "error": "Forbidden",
  "message": "Public API access is not configured for this instance."
}
```

#### File da creare

```
apps/api/src/public/
├── api-key-middleware.ts    ← Middleware autenticazione API Key
├── public-routes.ts         ← Router Hono con tutti gli endpoint pubblici
├── public-errors.ts         ← Costanti errori (come CONTENT_ERRORS)
├── sanitize.ts              ← Funzioni di sanitizzazione e validazione JSON
└── query-builder.ts         ← Builder dei filtri SQL (riusa/estendi da content.ts)
```

#### Implementazione del middleware

```typescript
// apps/api/src/public/api-key-middleware.ts
import type { Context, Next } from 'hono'

export function apiKeyMiddleware() {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const configuredKey = c.env.PUBLIC_API_KEY
    
    // Se la chiave non è configurata, l'API pubblica è disabilitata
    if (!configuredKey) {
      return c.json({
        error: 'Forbidden',
        message: 'Public API access is not configured for this instance.'
      }, 403)
    }

    // Cerca la chiave: prima nell'header, poi nel query param
    const providedKey = c.req.header('X-API-Key') ?? c.req.query('key')
    
    if (!providedKey || providedKey !== configuredKey) {
      return c.json({
        error: 'Unauthorized',
        message: 'Missing or invalid API key. Provide a valid key via X-API-Key header or ?key= query parameter.'
      }, 401)
    }

    await next()
  }
}
```

---

### 1. ENDPOINT FAMIGLIA 1 — GET (Lettura)

> **Scopo:** Recuperare contenuti dal database. Supporta query per ID, filtri avanzati, ordinamento, paginazione — con la stessa potenza delle query SQL.

#### 1.1 Struttura URL

**Base path:** `GET /api/v1/public/:seed`

Il parametro `:seed` è lo slug del tipo di contenuto (es. `articoli`, `prodotti`, `team`).

#### 1.2 Modalità di query (query params)

Ogni query param è **opzionale** e **concatenabile**. Se nessun param è specificato, restituisce tutte le entry del seed (con paginazione di default).

---

##### 1.2.1 — Per ID specifico

```
GET /api/v1/public/articoli?id=<uuid>
```

Restituisce una singola entry per il suo UUID. Se non trovata: errore 404.

**Risposta (200):**

```json
{
  "data": {
    "id": "uuid-1",
    "slug": "il-mio-articolo",
    "status": "published",
    "title": "Il mio primo articolo",
    "publishedAt": "2026-01-01",
    "coverImage": "https://...",
    "tags": ["cms", "tutorial"],
    "body": "<p>Contenuto...</p>",
    "metaTitle": "Il mio primo articolo | Blog",
    "metaDescription": "Una guida completa...",
    "created_at": 1700000000,
    "updated_at": 1700000000
  }
}
```

> **Nota:** `data` qui contiene **sia i metadati SQL** (`id`, `slug`, `status`, `created_at`, `updated_at`) **sia i dati payload** (alias del Seed) in un **unico oggetto flat**. Questo semplifica il consumo lato frontend.

---

##### 1.2.2 — Tutti gli elementi

```
GET /api/v1/public/articoli?all=true
```

Restituisce **tutte le entry** del seed (con paginazione di sicurezza: max 100 per pagina).

**Equivalente a:** nessun filtro + page=1 + limit=100.

**Risposta (200):**

```json
{
  "data": [ /* array di entry (stessa struttura del punto 1.2.1) */ ],
  "meta": {
    "total": 47,
    "page": 1,
    "limit": 100,
    "seed": "articoli"
  }
}
```

---

##### 1.2.3 — I più recenti

```
GET /api/v1/public/articoli?latest=5
```

Restituisce le ultime `N` entry ordinate per `created_at DESC`.

- `N` deve essere un intero positivo (`1 ≤ N ≤ 100`). Default: `10`.
- Se `N` > 100 o < 1, clamp a quei limiti.

**Risposta (200):**

```json
{
  "data": [ /* max N entry */ ],
  "meta": {
    "total": 47,
    "returned": 5,
    "seed": "articoli"
  }
}
```

---

##### 1.2.4 — Filtri avanzati (SQL-grade)

```
GET /api/v1/public/articoli?filter=<json_encoded>
```

Il parametro `filter` è un **JSON URL-encoded** che descrive le condizioni di filtro. Supporta la stessa potenza espressiva delle query SQL del content.ts interno.

**Struttura del filtro:**

```json
{
  "where": [
    {
      "field": "status",
      "op": "eq",
      "value": "published"
    },
    {
      "field": "price",
      "op": "gte",
      "value": 100
    }
  ],
  "logic": "AND",
  "orderBy": "created_at",
  "orderDir": "desc",
  "page": 1,
  "limit": 25
}
```

**Operatori supportati** (stessi di content.ts, esposti con sintassi user-friendly):

| Operatore | Descrizione | Tipi applicabili |
|-----------|-------------|-----------------|
| `eq` | Uguale esatto | text, number, boolean, date, select |
| `neq` | Diverso da | text, number, boolean, date, select |
| `gt` | Maggiore di | number, date |
| `gte` | Maggiore o uguale | number, date |
| `lt` | Minore di | number, date |
| `lte` | Minore o uguale | number, date |
| `contains` | Contiene (LIKE %val%) | text, richtext |
| `not_contains` | Non contiene | text, richtext |
| `starts_with` | Inizia con (LIKE val%) | text |
| `ends_with` | Finisce con (LIKE %val) | text |
| `is_empty` | È vuoto o NULL | tutti |
| `is_not_empty` | Non è vuoto e non NULL | tutti |
| `in` | Uno tra i valori (`value` = array) | text, number, select |
| `not_in` | Nessuno tra i valori | text, number, select |
| `has_tag` | Contiene il tag (per campi JSON tags) | json (tags) |
| `has_any_tag` | Contiene almeno uno dei tag (`value` = array) | json (tags) |
| `has_all_tags` | Contiene tutti i tag (`value` = array) | json (tags) |

**Connettori logici (`logic`):**

| Valore | Descrizione |
|--------|-------------|
| `AND` | Tutte le condizioni devono essere vere (default) |
| `OR` | Almeno una condizione deve essere vera |

**Esempio: "Tutti gli articoli pubblicati con tag 'tutorial' o 'news', ordinati per data":**

```
GET /api/v1/public/articoli?filter={"where":[{"field":"status","op":"eq","value":"published"},{"field":"tags","op":"has_any_tag","value":["tutorial","news"]}],"logic":"AND","orderBy":"publishedAt","orderDir":"desc","page":1,"limit":10}
```

**Validazione filtri:**
- Se `field` non corrisponde a nessun alias del Seed (e non è un campo di sistema come `status`, `slug`, `created_at`, `updated_at`): **ignora la condizione** (non errore, come la policy safe del Botanical Engine).
- Se `op` non è riconosciuto: restituisci errore `400`.
- Se `value` è di tipo incompatibile con l'operatore: restituisci errore `400`.

---

##### 1.2.5 — Ricerca full-text

```
GET /api/v1/public/articoli?search=tutorial
```

Effettua una ricerca LIKE su `slug`, `status` e `data` (stessa logica di `content.ts`).

Combinabile con `filter`, `latest`, `page`, `limit`.

---

##### 1.2.6 — Paginazione e ordinamento (standalone)

```
GET /api/v1/public/articoli?page=2&limit=10&orderBy=title&orderDir=asc
```

- `page`: intero ≥ 1 (default: 1)
- `limit`: intero 1-100 (default: 25)
- `orderBy`: alias di un branch del Seed, oppure `created_at`, `updated_at`, `status`, `slug`
- `orderDir`: `asc` | `desc` (default: `desc`)

---

##### 1.2.7 — Selezione campi (projections)

```
GET /api/v1/public/articoli?fields=title,coverImage,publishedAt
```

Restituisce solo i campi specificati (più `id`, `slug`, `status` sempre inclusi). Utile per ridurre il payload di rete.

- I campi sono separati da virgola.
- Campi non riconosciuti vengono ignorati silenziosamente.
- Se `fields` è vuoto o assente: restituisce tutti i campi.

---

#### 1.3 Formato risposta GET — Regole generali

**Singolo elemento (query per `id`):**

```json
{
  "data": { /* entry flat con alias + metadati */ },
  "meta": {
    "seed": "articoli"
  }
}
```

**Lista di elementi:**

```json
{
  "data": [ /* array di entry */ ],
  "meta": {
    "total": 47,
    "page": 1,
    "limit": 25,
    "returned": 25,
    "seed": "articoli"
  }
}
```

**Lista vuota (nessun risultato):**

```json
{
  "data": [],
  "meta": {
    "total": 0,
    "page": 1,
    "limit": 25,
    "returned": 0,
    "seed": "articoli"
  }
}
```

> **Non un errore:** Una lista vuota restituisce `200` con `data: []`, **non** 404.

---

#### 1.4 Errori GET

| Status | Condizione | Body |
|--------|-----------|------|
| 200 | Successo (anche se `data: []`) | Vedi sopra |
| 400 | Filtro malformato, operatore non riconosciuto, valore incompatibile | `{ "error": "Bad Request", "message": "Invalid filter: unknown operator 'xyz'" }` |
| 401 | API Key mancante o invalida | `{ "error": "Unauthorized", "message": "..." }` |
| 404 | Seed non esiste nel SEED_REGISTRY | `{ "error": "Seed Not Found", "message": "The content type 'xyz' does not exist. Available types: articoli, prodotti, team, testimonianze, pagine." }` |
| 500 | Errore database | `{ "error": "Internal Server Error", "message": "An unexpected error occurred." }` |

> **Nota sicurezza:** In produzione (`ENV=production`), il campo `message` degli errori 500 deve essere generico. In sviluppo può includere dettagli.

---

### 2. ENDPOINT FAMIGLIA 2 — POST (Aggiunta)

> **Scopo:** Inserire nuovi contenuti nel database passando per il CMS. Usato da form di contatto, registrazioni, frontend che inviano dati.

#### 2.1 Struttura URL

```
POST /api/v1/public/:seed/add
```

#### 2.2 Request Body

`Content-Type: application/json`

```json
{
  "slug": "il-mio-nuovo-articolo",
  "status": "draft",
  "data": {
    "title": "Il mio nuovo articolo",
    "publishedAt": "2026-04-07",
    "tags": ["news", "annuncio"],
    "body": "<p>Contenuto dell'articolo...</p>"
  }
}
```

**Campi del body:**

| Campo | Obbligatorio | Tipo | Descrizione |
|-------|-------------|------|-------------|
| `slug` | No | `string` | Slug URL dell'entry. Se non fornito, viene auto-generato dal campo `title`/`name` (slugify). |
| `status` | No | `string` | Status iniziale. Default: `"draft"`. Valori accettati: `draft`, `review`, `published`. |
| `data` | **Sì** | `object` | Payload con chiavi = alias del Seed. |

#### 2.3 Pipeline di validazione (prima di toccare D1)

Esegui questi step **in ordine**. Al primo fallimento, restituisci l'errore appropriato.

```
1. Verifica che :seed esista nel SEED_REGISTRY
   → 404 se non esiste

2. Parse del body JSON
   → 400 se il body non è JSON valido

3. Verifica che `data` sia un oggetto non vuoto
   → 400 se mancante o vuoto

4. Sanitizzazione di `data`:
   a. Per ogni chiave in `data`, verifica che sia un alias valido del Seed
      → Ignora chiavi non riconosciute (policy safe, come apiToDb)
   b. Per ogni valore, valida il tipo rispetto al `BranchType` del branch:
      - text/richtext: deve essere stringa, max 50.000 caratteri
      - number: deve essere number finito (no NaN, no Infinity)
      - boolean: deve essere boolean
      - date: deve essere stringa in formato ISO (YYYY-MM-DD o ISO 8601)
      - json: deve essere oggetto o array (non stringa raw)
      - file: deve essere stringa URL (validare con URL constructor)
   c. Sanitizza HTML nel richtext: strippa tag pericolosi (<script>, <iframe>,
      <object>, <embed>, event handlers on*). Mantieni tag formattazione
      sicuri (<p>, <h1>-<h6>, <strong>, <em>, <a>, <ul>, <ol>, <li>,
      <blockquote>, <code>, <pre>, <br>, <img>).
   d. Sanitizza stringhe: trim, rimuovi caratteri di controllo (U+0000-U+001F
      eccetto \n e \t)

5. Verifica unicità slug (se fornito):
   → 409 Conflict se slug già esiste per quel seed

6. Se slug non fornito: auto-genera da title/name
   → slugify: lowercase, replace spazi con -, rimuovi caratteri speciali,
     max 80 char. Se risulta vuoto, usa UUID troncato.
```

#### 2.4 Risposte POST

| Status | Condizione | Body |
|--------|-----------|------|
| 201 | Creazione riuscita | `{ "success": true, "id": "<uuid>", "slug": "il-mio-nuovo-articolo" }` |
| 400 | Body JSON invalido | `{ "error": "Bad Request", "message": "Invalid JSON body" }` |
| 400 | Campo `data` mancante o vuoto | `{ "error": "Bad Request", "message": "Field 'data' is required and must be a non-empty object" }` |
| 400 | Tipo di valore incompatibile | `{ "error": "Bad Request", "message": "Validation failed", "details": [{"field": "price", "expected": "number", "received": "string"}] }` |
| 401 | API Key mancante/invalida | `{ "error": "Unauthorized", "message": "..." }` |
| 404 | Seed non esiste | `{ "error": "Seed Not Found", "message": "The content type 'xyz' does not exist." }` |
| 409 | Slug già esistente | `{ "error": "Conflict", "message": "An entry with slug 'il-mio-articolo' already exists for content type 'articoli'." }` |
| 422 | Sanitizzazione fallita (dato pericoloso) | `{ "error": "Unprocessable Entity", "message": "Content rejected: dangerous markup detected in field 'body'" }` |
| 500 | Errore database | `{ "error": "Internal Server Error", "message": "An unexpected error occurred." }` |

---

### 3. ENDPOINT FAMIGLIA 3 — PUT (Modifica)

> **Scopo:** Modificare un contenuto esistente. L'entry viene identificata dal suo UUID.

#### 3.1 Struttura URL

```
PUT /api/v1/public/:seed/edit/:id
```

- `:seed` — slug del tipo di contenuto
- `:id` — UUID dell'entry da modificare

#### 3.2 Request Body

`Content-Type: application/json`

```json
{
  "slug": "articolo-aggiornato",
  "status": "published",
  "data": {
    "title": "Titolo aggiornato",
    "body": "<p>Nuovo contenuto...</p>"
  }
}
```

**Comportamento del merge:**

- I campi presenti in `data` **sovrascrivono** quelli esistenti.
- I campi **non presenti** in `data` rimangono invariati (partial update / PATCH semantics).
- Per **cancellare** un campo, inviare `"campo": null`.

#### 3.3 Pipeline di validazione (stessa logica del POST)

```
1. Verifica che :seed esista nel SEED_REGISTRY → 404
2. Verifica che :id sia un UUID valido → 400
3. Verifica che l'entry esista per quel seed+id → 404
4. Parse del body JSON → 400
5. Se `data` è presente:
   a. Stessa validazione/sanitizzazione del POST (step 4a-4d)
   b. Merge con i dati esistenti:
      - Leggi entry corrente dal DB
      - dbToApi(seed, currentData) per ottenere dati in alias
      - Mergia: { ...currentAliasData, ...newDataFromBody }
      - Rimuovi chiavi con valore null (cancellazione esplicita)
      - apiToDb(seed, mergedData) per convertire in br_xxx
6. Se `slug` è presente: verifica unicità (escludendo l'entry corrente) → 409
7. Se `status` è presente: valida sia tra i valori accettati → 400
```

#### 3.4 Risposte PUT

| Status | Condizione | Body |
|--------|-----------|------|
| 200 | Modifica riuscita | `{ "success": true, "id": "<uuid>", "slug": "articolo-aggiornato" }` |
| 400 | Body JSON invalido | `{ "error": "Bad Request", "message": "Invalid JSON body" }` |
| 400 | ID non è un UUID valido | `{ "error": "Bad Request", "message": "Invalid entry ID format" }` |
| 400 | Tipo di valore incompatibile | Come POST (con `details`) |
| 401 | API Key mancante/invalida | `{ "error": "Unauthorized", "message": "..." }` |
| 404 | Seed non esiste | `{ "error": "Seed Not Found", "message": "..." }` |
| 404 | Entry non trovata | `{ "error": "Not Found", "message": "Entry '<id>' not found for content type 'articoli'." }` |
| 409 | Nuovo slug già in uso | `{ "error": "Conflict", "message": "..." }` |
| 422 | Sanitizzazione fallita | Come POST |
| 500 | Errore database | `{ "error": "Internal Server Error", "message": "..." }` |

## `</specification>`

---

## `<context-implementation>`

### Struttura file completa da creare

```
apps/api/src/
├── public/
│   ├── index.ts                 ← Barrel export
│   ├── api-key-middleware.ts    ← Middleware API Key
│   ├── public-routes.ts         ← Router Hono principale
│   ├── public-errors.ts         ← Costanti errori
│   ├── public-read.ts           ← Handler GET /:seed (lettura)
│   ├── public-add.ts            ← Handler POST /:seed/add (aggiunta)
│   ├── public-edit.ts           ← Handler PUT /:seed/edit/:id (modifica)
│   ├── sanitize.ts              ← Sanitizzazione HTML, validazione tipi
│   ├── query-builder.ts         ← Costruttore filtri SQL per la Public API
│   ├── slug-utils.ts            ← Auto-generazione slug, slugify
│   └── response-builder.ts     ← Helper per costruire risposte uniformi
```

### Integrazione in `apps/api/src/index.ts`

Aggiungi al fondo di `index.ts`, **dopo** le rotte Content e Upload:

```typescript
import { publicRoutes } from './public'

// API Pubblica: endpoint per consumatori esterni, protetti da API Key
const apiPublic = new Hono<{ Bindings: Bindings; Variables: Variables }>()
apiPublic.use('*', apiKeyMiddleware())
apiPublic.route('/', publicRoutes)
app.route('/api/v1/public', apiPublic)
```

### Aggiornare `wrangler.jsonc` — variabile `PUBLIC_API_KEY`

```jsonc
"vars": {
  // ...variabili esistenti...
  "PUBLIC_API_KEY": "dev-public-key-changeme"
}
```

### Aggiornare CORS — permettere le rotte pubbliche

Le rotte `/api/v1/public/*` potrebbero essere chiamate da qualsiasi origine (siti frontend). Valuta se:
- Usare le stesse origini CORS configurate, **oppure**
- Permettere un set più ampio (configurable `PUBLIC_CORS_ORIGINS`).

Per lo sprint iniziale, **usa le stesse origini** di `CORS_ORIGINS`.

## `</context-implementation>`

---

## `<constraints>`

### Non fare

- ❌ NON duplicare `buildWhereClause`, `buildOrderClause`, `buildSqlCondition` o `rowToEntry` da `content.ts`. **Estrai** queste funzioni in un modulo condiviso (`apps/api/src/shared/` o `apps/api/src/query-utils.ts`) e importale sia da `content.ts` che da `public-read.ts`.
- ❌ NON accedere ai dati con chiavi `br_xxx` — usa sempre `apiToDb` / `dbToApi`.
- ❌ NON esporre messaggi d'errore dettagliati in produzione (controlla `ENV`).
- ❌ NON permettere injection SQL — tutti i parametri DEVONO usare prepared statements con `.bind()`.
- ❌ NON utilizzare regex per sanitizzare HTML (fragile e bypassabile). Preferisci un approccio a **allowlist di tag** con un parser DOM-like leggero, oppure una regex ben testata con fallback conservativo.
- ❌ NON fidarti mai dell'input utente: ogni campo va sanitizzato, anche se il tipo sembra corretto.
- ❌ NON introdurre nuove dipendenze npm senza giustificazione documentata. DOMPurify/sanitize-html sono accettabili ma non obbligatori — una soluzione lightweight basata su regex allowlist è sufficiente per il richtext.
- ❌ NON creare controller "per entità" (es. `/api/v1/public/articles`) — usa sempre `:seed` dinamico.

### Devi

- ✅ Seguire il pattern **schema-driven**: tutto passa per `getSeed` e il Botanical Engine.
- ✅ Ogni handler deve verificare `getSeed(seed) !== null` come primo step.
- ✅ Usare **prepared statements** D1 per TUTTE le query (`.bind()`, mai concatenazione).
- ✅ Restituire **sempre** JSON, anche per errori.
- ✅ Includere il campo `seed` nella risposta `meta` per permettere al client di validare la risposta.
- ✅ Supportare **tutti i 5 seed registrati** senza configurazione aggiuntiva.
- ✅ Scrivere codice **testabile**: funzioni pure per sanitizzazione, validazione, slug generation. Ogni funzione in file separato, esportata.
- ✅ Aggiungere JSDoc a ogni funzione esportata.
- ✅ Seguire le convenzioni TypeScript strict del progetto.

## `</constraints>`

---

## `<examples>`

### Esempio 1 — Lettura ultimi 3 articoli pubblicati

```bash
curl -X GET "http://localhost:8787/api/v1/public/articoli?filter=%7B%22where%22%3A%5B%7B%22field%22%3A%22status%22%2C%22op%22%3A%22eq%22%2C%22value%22%3A%22published%22%7D%5D%2C%22logic%22%3A%22AND%22%7D&latest=3" \
  -H "X-API-Key: dev-public-key-changeme"
```

Risposta:
```json
{
  "data": [
    {
      "id": "uuid-1",
      "slug": "primo-articolo",
      "status": "published",
      "title": "Primo articolo",
      "publishedAt": "2026-04-07",
      "tags": ["news"],
      "created_at": 1700000003,
      "updated_at": 1700000003
    },
    {
      "id": "uuid-2",
      "slug": "secondo-articolo",
      "status": "published",
      "title": "Secondo articolo",
      "publishedAt": "2026-04-06",
      "tags": ["tutorial"],
      "created_at": 1700000002,
      "updated_at": 1700000002
    }
  ],
  "meta": {
    "total": 20,
    "returned": 2,
    "seed": "articoli"
  }
}
```

### Esempio 2 — Aggiunta nuova testimonianza

```bash
curl -X POST "http://localhost:8787/api/v1/public/testimonianze/add" \
  -H "X-API-Key: dev-public-key-changeme" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "draft",
    "data": {
      "author": "Mario Rossi",
      "company": "Acme Inc.",
      "quote": "Servizio eccellente!",
      "rating": 5,
      "date": "2026-04-07",
      "active": true
    }
  }'
```

Risposta (201):
```json
{
  "success": true,
  "id": "a1b2c3d4-...",
  "slug": "mario-rossi"
}
```

### Esempio 3 — Modifica articolo (partial update)

```bash
curl -X PUT "http://localhost:8787/api/v1/public/articoli/edit/uuid-1" \
  -H "X-API-Key: dev-public-key-changeme" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "published",
    "data": {
      "title": "Titolo aggiornato",
      "metaTitle": null
    }
  }'
```

Risposta (200):
```json
{
  "success": true,
  "id": "uuid-1",
  "slug": "primo-articolo"
}
```

> `metaTitle: null` cancella quel campo dall'entry.

### Esempio 4 — Seed inesistente

```bash
curl -X GET "http://localhost:8787/api/v1/public/invalidtype" \
  -H "X-API-Key: dev-public-key-changeme"
```

Risposta (404):
```json
{
  "error": "Seed Not Found",
  "message": "The content type 'invalidtype' does not exist. Available types: articoli, prodotti, team, testimonianze, pagine."
}
```

### Esempio 5 — Body malformato

```bash
curl -X POST "http://localhost:8787/api/v1/public/articoli/add" \
  -H "X-API-Key: dev-public-key-changeme" \
  -H "Content-Type: application/json" \
  -d '{ "data": { "price": "non-un-numero" } }'
```

Risposta (400):
```json
{
  "error": "Bad Request",
  "message": "Validation failed",
  "details": [
    {
      "field": "price",
      "expected": "number",
      "received": "string",
      "message": "Field 'price' expects type 'number' but received 'string'"
    }
  ]
}
```

## `</examples>`

---

## `<chain-of-thought>`

Prima di scrivere codice, ragiona ad alta voce seguendo questo ordine:

1. **Leggi** i file chiave elencati in `<context-architecture>` e comprendi come `content.ts` costruisce query SQL dinamiche.

2. **Estrai** le utility condivise:
   - Identifica le funzioni in `content.ts` che devono essere riusate: `buildWhereClause`, `buildOrderClause`, `buildSqlCondition`, `rowToEntry`, `parseQueryFilters`, `getColumnSqlExpression`, `cleanStr`, `safeParseJson`, `parsePositiveInt`.
   - Crea `apps/api/src/shared/query-utils.ts` con queste funzioni e aggiorna `content.ts` per importarle da lì.

3. **Crea** i file della Public API nell'ordine:
   - `public-errors.ts` — costanti errori
   - `sanitize.ts` — sanitizzazione HTML + validazione tipi
   - `slug-utils.ts` — auto-generazione slug
   - `response-builder.ts` — helper risposte uniformi
   - `query-builder.ts` — estensione dei filtri per la sintassi pubblica
   - `api-key-middleware.ts` — middleware API Key
   - `public-read.ts` — handler GET
   - `public-add.ts` — handler POST
   - `public-edit.ts` — handler PUT
   - `public-routes.ts` — router che compone tutto
   - `index.ts` — barrel export

4. **Integra** in `apps/api/src/index.ts` registrando il router su `/api/v1/public`.

5. **Verifica** che il build TypeScript non abbia errori.

6. **Testa** con curl almeno i 5 esempi documentati in `<examples>`.

## `</chain-of-thought>`

---

## `<output-format>`

Per ogni file che crei o modifichi, fornisci:

1. **Il percorso assoluto** del file (es. `apps/api/src/public/sanitize.ts`).
2. **Il codice completo** del file (non frammenti — il file per intero).
3. **Una nota di 2-3 righe** che spiega le decisioni non ovvie prese in quel file.

Alla fine, fornisci una **checklist di verifica**:

```
- [ ] API Key middleware funziona (401 senza key, 403 se non configurata, pass con key valida)
- [ ] GET /api/v1/public/:seed restituisce tutte le entry con paginazione
- [ ] GET con ?id=<uuid> restituisce una singola entry
- [ ] GET con ?latest=N restituisce le ultime N entry
- [ ] GET con ?filter=<json> applica i filtri correttamente (AND/OR)
- [ ] GET con ?search=<term> effettua ricerca full-text
- [ ] GET con ?fields=<list> proietta solo i campi richiesti
- [ ] GET con seed inesistente → 404 con messaggio informativo
- [ ] POST /api/v1/public/:seed/add crea una nuova entry
- [ ] POST valida e sanitizza il body prima dell'inserimento
- [ ] POST auto-genera lo slug da title/name se non fornito
- [ ] POST rifiuta tipi di dato incompatibili con dettagli specifici
- [ ] POST rifiuta HTML pericoloso nel richtext con errore 422
- [ ] PUT /api/v1/public/:seed/edit/:id aggiorna una entry esistente
- [ ] PUT supporta partial update (merge con dati esistenti)
- [ ] PUT permette di cancellare campi con null
- [ ] PUT con entry inesistente → 404
- [ ] Tutte le query usano prepared statements (.bind())
- [ ] Le utility condivise sono estratte da content.ts senza duplicazione
- [ ] Nessun errore TypeScript (npm run build -w @beech/core && npm run build -w api)
- [ ] Funziona con tutti e 5 i seed registrati (articoli, prodotti, team, testimonianze, pagine)
```

## `</output-format>`

---

## Note aggiuntive per sprint futuri

### Decisione architetturale (aggiornata)

Per ridurre duplicazioni tra Public API e Botanical Engine, la foundation di validazione/sanitizzazione viene centralizzata in `packages/core` gia durante Sprint 02.

- Sprint 02 implementa nel core le funzioni comuni necessarie ai flussi pubblici POST/PUT (sanitizzazione + validazione runtime + dettagli errore).
- `apps/api` usa adapter locali per mappare gli esiti del core in risposte HTTP (`400`, `422`, ecc.).
- Le validazioni Zod complete restano pianificate nel core in uno sprint dedicato.

Questo sprint **NON** include:
- Rate limiting sulle rotte pubbliche (Sprint futuro — usare Cloudflare Rate Limiter come per auth)
- Supporto per API Key multiple (una per progetto/client)
- Webhook su creazione/modifica (notify endpoint esterno)
- Cache layer (Cloudflare Cache API o KV per GET frequenti)
- Supporto per DELETE via API pubblica (per sicurezza, solo da CMS dashboard)
- Validazione Zod completa degli schemi (Sprint dedicato nel core, referenziato nel Botanical Engine TODO)
- Versioning API (`/api/v1/public/...`)

---

*Documento creato: 2026-04-07 | Autore: Flavio De Musso | Revisione: Sprint Planning*
