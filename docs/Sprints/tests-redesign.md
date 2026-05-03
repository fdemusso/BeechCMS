# Sprint: Riscrizione Test BeechCMS

Questo documento delinea il piano per la modernizzazione della suite di test di BeechCMS, passando da test isolati e "antiquati" a test di integrazione orientati ai **flow** reali dell'utente, seguendo l'architettura Vertical Slice.

## Obiettivi
- Sostituire i mock frammentati con un layer di database "statico" alimentato dai Seed.
- Coprire i flow principali dell'applicazione.
- Testare sistematicamente: valori attesi, valori errati e edge case.

## Architettura dei Test
Ogni test deve utilizzare un **Static Repository Layer** che:
1. Implementa l'interfaccia `ContentRepository` (definita in `@beechcms/core`).
2. Risponde in modo deterministico basandosi sui dati caricati (es. dai Seed).
3. Mantiene uno stato in-memory per simulare persistenza durante il flow (es. create -> get).
4. Viene iniettato via `BeechConfig` in `createBeechApp`, che lo passa a `repositoryMiddleware`.

### Pattern di iniezione

`BeechConfig` accetta `repository` e `idempotencyRepository` opzionali. Quando forniti, `repositoryMiddleware` li usa al posto delle implementazioni D1. Non occorre passare `DB` nell'env né aggiungere middleware dopo la creazione dell'app.

```typescript
const repo = new StaticContentRepository(testSeeds)
const idempotencyRepo = new StaticIdempotencyRepository()
const app = createBeechApp({ seeds: testSeeds, repository: repo, idempotencyRepository: idempotencyRepo })
```

Questo elimina ogni dipendenza da `D1Database` nei test di flow e rende l'iniezione esplicita e type-safe.

### Fonte Dati Unificata (Fixtures)
Per garantire che i test siano deterministici e testati a 360 gradi su un set di dati coerente, utilizziamo un file centrale di fixture:
- `apps/api/test/fixtures.ts`: Contiene `TEST_SEEDS`, `TEST_USERS` e `TEST_ENV`.
Tutti i test di flow devono importare i dati da questo file invece di definirli localmente.

---

## 1. Flow: Guest Access (Public API)
Questo flow rappresenta un utente esterno che consuma i contenuti o invia un form.

### GET `/api/v1/public/:seed` (Lista Contenuti)
- [x] **Valori attesi**:
    - [x] Richiesta con API Key valida ritorna lista paginata.
    - [x] Filtro per `page` e `pageSize` funziona correttamente.
    - [x] Campi con `public: false` sono rimossi dal JSON.
    - [ ] Ordinamento (sort) funziona per i campi indicizzati.
- [x] **Valori errati**:
    - [x] API Key mancante o errata (401).
    - [x] Seed inesistente (404).
    - [x] Seed con `allowPublicRead: false` (403).
- [x] **Edge case**:
    - [x] Richiesta pagina 99999 (ritorna lista vuota o meta coerente).
    - [x] `pageSize` > 100 (deve essere cappato a 100).

### GET `/api/v1/public/:seed/:id_or_slug` (Dettaglio Contenuto)
- [x] **Valori attesi**:
    - [x] Recupero per ID numerico ritorna l'entry corretta.
    - [ ] Recupero per slug (se abilitato) ritorna l'entry corretta.
    - [x] Solo i campi pubblici sono visibili.
- [x] **Valori errati**:
    - [x] ID inesistente (404).
    - [x] Entry esistente ma `status: draft` (404 per il pubblico).

### POST `/api/v1/public/:seed/add` (Invio Form/Contenuto)
- [x] **Valori attesi**:
    - [x] Payload valido crea entry con `status: draft` (o come da config).
    - [x] Idempotenza: invii duplicati con lo stesso `X-Idempotency-Key` ritornano la stessa risposta senza duplicare record.
    - [x] Ritorna ID della nuova entry.
- [x] **Valori errati**:
    - [ ] E-mail malformata (se presente campo email) ritorna 422.
    - [x] Campi `requiredOnCreate: true` mancanti ritornano 400.
    - [x] Payload non JSON (400).
- [ ] **Edge case**:
    - [ ] Inserimento di script/HTML (XSS) in campi text (deve essere sanitizzato).
    - [ ] Payload estremamente grande (DoS protection).

---

## 2. Flow: Admin Authentication
Questo flow rappresenta il login del gestore del sito.

### POST `/auth/login`
- [x] **Valori attesi**:
    - [x] Credenziali corrette ritornano Access Token e impostano Refresh Cookie.
- [x] **Valori errati**:
    - [x] Password errata (401).
    - [x] Utente non esistente (401 - timing attack protection).
- [ ] **Edge case**:
    - [ ] Tentativi multipli rapidi (Rate Limiting attivo).
    - [ ] E-mail con spazi bianchi (trimming).

### POST `/auth/refresh` (Rotazione Token)
- [x] **Valori attesi**:
    - [x] Refresh Cookie valido genera nuovo Access Token e **nuovo** Refresh Cookie (rotazione).
    - [x] Il vecchio Refresh Token viene invalidato immediatamente.
- [x] **Valori errati**:
    - [x] Cookie mancante o alterato (401).
    - [x] Refresh Token già utilizzato o scaduto (401).

### POST `/auth/logout`
- [x] **Valori attesi**:
    - [x] Il Refresh Token viene rimosso dal database (revocato).
    - [x] Il cookie viene cancellato.

---

## 3. Flow: Content Management (Protected API)
Questo flow rappresenta l'admin che gestisce il database.

### GET `/api/content/:slug` (Lista Admin)
- [x] **Valori attesi**:
    - [x] Ritorna tutti i campi (anche `public: false`).
    - [x] Filtri complessi (es. `status=draft`, `search=abc`) funzionano.
    - [x] Presenza di metadati (es. `updated_at`, `created_at`).

### POST `/api/content/:slug` (Creazione Interna)
- [x] **Valori attesi**:
    - [x] Creazione con `status: published` riuscita.
    - [x] Generazione automatica dello slug dal `displayNameAlias`.
- [x] **Valori errati**:
    - [x] Token JWT scaduto o mancante (401).
    - [x] Tentativo di creare entry con slug duplicato (409).
- [x] **Edge case**:
    - [ ] Titolo molto lungo (> 255 caratteri).
    - [x] Caratteri Unicode/Emoji nello slug.

### PUT `/api/content/:slug/:id` (Aggiornamento Live)
- [x] **Valori attesi**:
    - [x] Modifica dei campi riuscita.
    - [x] Lo slug non cambia a meno di richiesta esplicita.
- [x] **Valori errati**:
    - [x] ID inesistente (404).
    - [x] Validazione fallita per tipi di dato errati (es. stringa in campo numerico).

### DELETE `/api/content/:slug/:id` (Eliminazione e Cleanup)
- [x] **Valori attesi**:
    - [x] Eliminazione record dal DB.
    - [x] Chiamata al layer R2 per cancellare i file associati (se presenti).
- [x] **Valori errati**:
    - [x] ID inesistente (404).
- [x] **Edge case**:
    - [x] Eliminazione entry con file già cancellati su R2 (non deve crashare).

---

## 4. Flow: Draft Management (Mirror Tables)
Questo flow testa la logica delle bozze pendenti che non influenzano il sito live.

### PUT `/api/content/:slug/:id/draft` (Salva Bozza)
- [x] **Valori attesi**:
    - [x] I dati vengono salvati nella tabella `_drafts`.
    - [x] La versione live rimane invariata.
    - [x] Sovrascrittura di una bozza esistente funziona.
- [x] **Valori errati**:
    - [x] Tentativo di salvare bozza su un Seed che ha `allowDrafts: false`.

### POST `/api/content/:slug/:id/draft/publish` (Pubblica)
- [x] **Valori attesi**:
    - [x] Operazione atomica: i dati passano da `_drafts` a tabella principale.
    - [x] La riga in `_drafts` viene eliminata.
    - [x] Il sito live riflette immediatamente i cambiamenti.

### DELETE `/api/upload/:key` (Eliminazione Media)
- [x] **Valori attesi**:
    - [x] Eliminazione fisica da R2.
    - [x] Pulizia record `media_objects` e aggiornamento `system_stats` (storage bytes).

---

## 5. Flow: Media & Assets (R2)
Testa l'integrazione con il bucket R2 per la gestione dei file.

### POST `/api/upload` (Upload File)
- [x] **Valori attesi**:
    - [x] Upload di immagine riuscito, ritorna URL/Key.
    - [x] Generazione di path deterministici basati sul timestamp/slug.
- [x] **Valori errati**:
    - [x] File troppo grande (Max payload size).
    - [x] Formato file non ammesso (es. `.exe`).

---

## 6. Flow: System & Schema
Verifica che l'engine Botanical e le impostazioni siano coerenti.

### GET `/api/schema`
- [x] **Valori attesi**:
    - [x] Ritorna la struttura completa dei Seed registrati.
    - [x] I tipi di dato corrispondono a quanto definito nel codice.

### GET `/api/settings`
- [x] **Valori attesi**:
    - [x] Ritorna configurazioni generali (titolo sito, loghi, etc).

---

## 7. Flow: Global Middleware & Security
Verifica le protezioni trasversali dell'API.

### Rate Limiting
- [ ] **Public Read**: Superamento limite su `/api/v1/public/:seed` ritorna 429.
- [ ] **Public Write**: Superamento limite su `/api/v1/public/:seed/add` ritorna 429.
- [ ] **Auth**: Protezione brute-force su `/auth/login`.

### CORS & Security Headers
- [ ] **CORS**: Verifica che l'header `Access-Control-Allow-Origin` corrisponda alla config.
- [ ] **Security**: Presenza di `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`.
- [ ] **CSP**: Verifica che la Content Security Policy sia correttamente applicata (soprattutto su `/admin`).

---

## 8. Flow: Policies & Data Privacy
Testa come il Botanical Engine tratta i dati sensibili.

### Visibility Policies
- [ ] **Masked**: Campi con `visibility: masked` ritornano `••••••••` nelle API.
- [ ] **Hidden**: Campi con `visibility: hidden` sono totalmente assenti dal JSON di risposta.

### Privacy Policies
- [ ] **Hash**: Campi con `privacy: hash` vengono salvati nel DB come hash SHA-256 (irreversibili).
- [ ] **Encrypted**: Campi con `privacy: encrypted` sono cifrati nel DB ma decifrati nell'API Admin.

---

## 9. Flow: Activity Logging
Verifica che ogni azione amministrativa lasci una traccia.

- [ ] **Audit**: Ogni operazione di `create`, `update`, `delete`, `publish` deve generare una riga nella tabella `activity_log`.
- [ ] **Details**: Il log deve contenere dettagli utili (es. titolo dell'entry modificata, note sull'azione).

---

---

## Prossimi Passi

1. **Refactoring Repository (COMPLETATO)**:
    - Interfacce `ContentRepository` e `IdempotencyRepository` definite in `@beechcms/core`.
    - `D1ContentRepository` e `D1IdempotencyRepository` in `apps/api/src/shared/`.
    - `repositoryMiddleware` inietta le implementazioni D1 nel contesto Hono.

2. **Middleware Injection per Test (COMPLETATO)**:
    - `BeechConfig` accetta `repository?` e `idempotencyRepository?`.
    - `repositoryMiddleware` usa gli override quando forniti, altrimenti crea le implementazioni D1.
    - Pattern documentato nella sezione "Architettura dei Test" sopra.

3. **Static Repository Layer (COMPLETATO)**:
    - `StaticContentRepository` in `apps/api/test/mocks/static-content.repository.ts`.
    - `StaticIdempotencyRepository` in `apps/api/test/mocks/static-idempotency.repository.ts`.
    - POC di flow test in `apps/api/test/poc-flow.test.ts`.

4. **Flow: Guest Access (COMPLETATO)**:
    - `apps/api/test/flow-guest-access.test.ts` — 18 test, tutti passanti.
    - `apps/api/test/poc-flow.test.ts` — corretto (payload errato, header idempotenza, URL detail).
    - Fix in `apps/api/src/factory.ts`: public routes registrate prima di quelle protette.

5. **Fonte Dati Unificata & Admin Auth Flow (COMPLETATO)**:
    - Centralizzazione dati in `apps/api/test/fixtures.ts` (Seeds, Users, ENV).
    - Creazione `MockD1Database` riutilizzabile in `apps/api/test/mocks/mock-d1-database.ts`.
    - `apps/api/test/flow-admin-auth.test.ts` — 7 test passanti (Login, Refresh, Logout, Rotation).

6. **Content Management Flow (COMPLETATO)**:
    - `apps/api/test/flow-content-management.test.ts` — 13 test passanti.
    - Copertura: CRUD admin, auto-slug, filtri complessi, validation.

7. **Draft Management Flow (COMPLETATO)**:
    - `apps/api/test/flow-draft-management.test.ts` — 9 test passanti.
    - Copertura: Save draft, Get draft, Publish (atomic promotion), Discard, Draft policies.

8. **Migrazione dei Test (prossimo step)**:
    - Sostituire i `createMockD1*` inline presenti in `content.test.ts`, `public-read.test.ts`, `public-add.test.ts`, `public-edit.test.ts` con `StaticContentRepository` e dati da `fixtures.ts`.
    - Procedere per flow: **Media & Assets (COMPLETATO)**.
    - `apps/api/test/flow-media-assets.test.ts` — 7 test passanti.
    - Refactor `factory.ts` per consolidare rotte protette e correggere priorità media pubblici.
    - Rimuovere le dipendenze da `../src/index` nei test di content sostituendole con `createBeechApp`.

9. **System & Schema Flow (COMPLETATO)**:
    - `apps/api/test/flow-system-schema.test.ts` — 3 test passanti.
    - Copertura: GET /api/schema (auth e struttura), GET /api/settings (config generali).
    - Bug Fix: Filtraggio preventivo di oggetti invalidi (module exports) nel registro dei Seeds in `factory.ts`.

---

## API Contract — Scoperte critiche per i test

Queste sono le discrepanze tra l'intuizione iniziale e il comportamento reale dell'API. Documentate per evitare di ri-fare le stesse ricerche.

### POST `/api/v1/public/:seed/add`
- **Payload richiesto**: `{ status?: string, data: { ...campi } }`. I campi NON vanno al top-level.
- **Status default**: `draft`. Per vederli nella lista pubblica usare `{ status: 'published', data: {...} }`.
- **Header idempotenza**: `Idempotency-Key` (senza prefisso `X-`). `X-Idempotency-Key` viene ignorato.
- **Risposta successo**: `{ success: true, id: string, slug: string }` con status 201.
- **Validazione**: missing `requiredOnCreate` field → 400 (non 422). Richtext pericoloso → 422.

### GET `/api/v1/public/:seed` (List e Detail)
- **Detail NON ha route separata**. Non esiste `GET /:seed/:id`. Il detail si ottiene con `GET /:seed?id=<uuid>` sulla stessa route della lista.
- **Solo published**: per default la lista e il detail restituiscono solo entries con `status: published`. Override via env `PUBLIC_PUBLISHED_ONLY=false`.
- **Campi pubblici**: solo i branches con `policies: { public: true }` appaiono nella risposta. Il default è non-public.

### Seed definition nei test
- Il tipo `email` **non esiste** come `BranchType`. Usare `text` con alias descrittivo (es. `contact_email`).
- Branches senza `policies` esplicite → non visibili nella Public API.

### factory.ts — ordine registrazione routes
- Le public routes (`/api/v1/public`) **devono essere registrate prima** di `apiProtected` (che monta authMiddleware su `/api/*`). Altrimenti il middleware JWT intercetta le route pubbliche.
- Già corretto in `apps/api/src/factory.ts`.

### ENV minimo per test di flow
```typescript
const ENV = {
  JWT_SECRET: 'test-secret',
  PUBLIC_READ_API_KEY: 'read-key',
  PUBLIC_WRITE_API_KEY: 'write-key',
  ENV: 'development',
}
```

---

## Esempio di Flow Test (Nuovo Stile)

```typescript
import { StaticContentRepository } from './mocks/static-content.repository'
import { StaticIdempotencyRepository } from './mocks/static-idempotency.repository'

describe('Flow: Guest Access', () => {
  let repo: StaticContentRepository
  let app: ReturnType<typeof createBeechApp>

  beforeEach(() => {
    repo = new StaticContentRepository(testSeeds)
    app = createBeechApp({
      seeds: testSeeds,
      repository: repo,
      idempotencyRepository: new StaticIdempotencyRepository(),
    })
  })

  it('POST add → GET detail: entry persiste nel repository', async () => {
    // payload: { status, data: { ...campi } } — NON flat
    const postRes = await app.request('/api/v1/public/posts/add', {
      method: 'POST',
      body: JSON.stringify({ status: 'published', data: { title: 'Nuovo Post' } }),
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'write-key' }
    }, ENV)

    const { id } = await postRes.json()

    // detail: ?id=uuid sulla route lista, NON /:seed/:id
    const getRes = await app.request(`/api/v1/public/posts?id=${id}`, {
      headers: { 'X-API-Key': 'read-key' }
    }, ENV)

    const { data } = await getRes.json()
    expect(data.title).toBe('Nuovo Post')
  })
})
```
