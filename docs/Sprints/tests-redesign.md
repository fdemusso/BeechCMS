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
4. Viene iniettato nel contesto Hono sovrascrivendo l'implementazione D1 reale.

---

## 1. Flow: Guest Access (Public API)
Questo flow rappresenta un utente esterno che consuma i contenuti o invia un form.

### GET `/api/v1/public/:seed` (Lista Contenuti)
- [ ] **Valori attesi**:
    - [ ] Richiesta con API Key valida ritorna lista paginata.
    - [ ] Filtro per `page` e `pageSize` funziona correttamente.
    - [ ] Campi con `public: false` sono rimossi dal JSON.
    - [ ] Ordinamento (sort) funziona per i campi indicizzati.
- [ ] **Valori errati**:
    - [ ] API Key mancante o errata (401).
    - [ ] Seed inesistente (404).
    - [ ] Seed con `allowPublicRead: false` (401/404).
- [ ] **Edge case**:
    - [ ] Richiesta pagina 99999 (ritorna lista vuota o meta coerente).
    - [ ] `pageSize` > 100 (deve essere cappato a 100).

### GET `/api/v1/public/:seed/:id_or_slug` (Dettaglio Contenuto)
- [ ] **Valori attesi**:
    - [ ] Recupero per ID numerico ritorna l'entry corretta.
    - [ ] Recupero per slug (se abilitato) ritorna l'entry corretta.
    - [ ] Solo i campi pubblici sono visibili.
- [ ] **Valori errati**:
    - [ ] ID inesistente (404).
    - [ ] Entry esistente ma `status: draft` (404 per il pubblico).

### POST `/api/v1/public/:seed/add` (Invio Form/Contenuto)
- [ ] **Valori attesi**:
    - [ ] Payload valido crea entry con `status: draft` (o come da config).
    - [ ] Idempotenza: invii duplicati con lo stesso `X-Idempotency-Key` ritornano la stessa risposta senza duplicare record.
    - [ ] Ritorna ID della nuova entry.
- [ ] **Valori errati**:
    - [ ] E-mail malformata (se presente campo email) ritorna 422.
    - [ ] Campi `requiredOnCreate: true` mancanti ritornano 422.
    - [ ] Payload non JSON (400).
- [ ] **Edge case**:
    - [ ] Inserimento di script/HTML (XSS) in campi text (deve essere sanitizzato).
    - [ ] Payload estremamente grande (DoS protection).

---

## 2. Flow: Admin Authentication
Questo flow rappresenta il login del gestore del sito.

### POST `/auth/login`
- [ ] **Valori attesi**:
    - [ ] Credenziali corrette ritornano Access Token e impostano Refresh Cookie.
- [ ] **Valori errati**:
    - [ ] Password errata (401).
    - [ ] Utente non esistente (401 - timing attack protection).
- [ ] **Edge case**:
    - [ ] Tentativi multipli rapidi (Rate Limiting attivo).
    - [ ] E-mail con spazi bianchi (trimming).

### POST `/auth/refresh` (Rotazione Token)
- [ ] **Valori attesi**:
    - [ ] Refresh Cookie valido genera nuovo Access Token e **nuovo** Refresh Cookie (rotazione).
    - [ ] Il vecchio Refresh Token viene invalidato immediatamente.
- [ ] **Valori errati**:
    - [ ] Cookie mancante o alterato (401).
    - [ ] Refresh Token già utilizzato o scaduto (401).

### POST `/auth/logout`
- [ ] **Valori attesi**:
    - [ ] Il Refresh Token viene rimosso dal database.
    - [ ] Il cookie viene cancellato.

---

## 3. Flow: Content Management (Protected API)
Questo flow rappresenta l'admin che gestisce il database.

### GET `/api/content/:slug` (Lista Admin)
- [ ] **Valori attesi**:
    - [ ] Ritorna tutti i campi (anche `public: false`).
    - [ ] Filtri complessi (es. `status=draft`, `search=abc`) funzionano.
    - [ ] Presenza di metadati (es. `updated_at`, `created_at`).

### POST `/api/content/:slug` (Creazione Interna)
- [ ] **Valori attesi**:
    - [ ] Creazione con `status: published` riuscita.
    - [ ] Generazione automatica dello slug dal `displayNameAlias`.
- [ ] **Valori errati**:
    - [ ] Token JWT scaduto o mancante (401).
    - [ ] Tentativo di creare entry con slug duplicato (409).
- [ ] **Edge case**:
    - [ ] Titolo molto lungo (> 255 caratteri).
    - [ ] Caratteri Unicode/Emoji nello slug.

### PUT `/api/content/:slug/:id` (Aggiornamento Live)
- [ ] **Valori attesi**:
    - [ ] Modifica dei campi riuscita.
    - [ ] Lo slug non cambia a meno di richiesta esplicita.
- [ ] **Valori errati**:
    - [ ] ID inesistente (404).
    - [ ] Validazione fallita per tipi di dato errati (es. stringa in campo numerico).

### DELETE `/api/content/:slug/:id` (Eliminazione e Cleanup)
- [ ] **Valori attesi**:
    - [ ] Eliminazione record dal DB.
    - [ ] Chiamata al layer R2 per cancellare i file associati (se presenti).
- [ ] **Valori errati**:
    - [ ] ID inesistente (404).
- [ ] **Edge case**:
    - [ ] Eliminazione entry con file già cancellati su R2 (non deve crashare).

---

## 4. Flow: Draft Management (Mirror Tables)
Questo flow testa la logica delle bozze pendenti che non influenzano il sito live.

### PUT `/api/content/:slug/:id/draft` (Salva Bozza)
- [ ] **Valori attesi**:
    - [ ] I dati vengono salvati nella tabella `_drafts`.
    - [ ] La versione live rimane invariata.
    - [ ] Sovrascrittura di una bozza esistente funziona.
- [ ] **Valori errati**:
    - [ ] Tentativo di salvare bozza su un Seed che ha `allowDrafts: false`.

### POST `/api/content/:slug/:id/draft/publish` (Pubblica)
- [ ] **Valori attesi**:
    - [ ] Operazione atomica: i dati passano da `_drafts` a tabella principale.
    - [ ] La riga in `_drafts` viene eliminata.
    - [ ] Il sito live riflette immediatamente i cambiamenti.

---

## 5. Flow: Media & Assets (R2)
Testa l'integrazione con il bucket R2 per la gestione dei file.

### POST `/api/upload` (Upload File)
- [ ] **Valori attesi**:
    - [ ] Upload di immagine riuscito, ritorna URL/Key.
    - [ ] Generazione di path deterministici basati sul timestamp/slug.
- [ ] **Valori errati**:
    - [ ] File troppo grande (Max payload size).
    - [ ] Formato file non ammesso (es. `.exe`).

---

## 6. Flow: System & Schema
Verifica che l'engine Botanical e le impostazioni siano coerenti.

### GET `/api/schema`
- [ ] **Valori attesi**:
    - [ ] Ritorna la struttura completa dei Seed registrati.
    - [ ] I tipi di dato corrispondono a quanto definito nel codice.

### GET `/api/settings`
- [ ] **Valori attesi**:
    - [ ] Ritorna configurazioni generali (titolo sito, loghi, etc).

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
1. **Static Repository Layer (StaticContentRepository)**: 
    - Implementare una classe `StaticContentRepository` in `apps/api/test/mocks/`.
    - Deve implementare l'interfaccia `ContentRepository`.
    - Deve mantenere un `state` in-memory (es. una Map) per permettere test di flow.
    - Deve validare i dati in ingresso usando i `Seed`.

2. **Refactoring Repository (COMPLETATO)**:
    - La logica DB è stata estratta dagli handler e isolata nei repository seguendo la `Vertical Slice Architecture`.
    - L'interfaccia è definita in `@beechcms/core`.

3. **Migrazione dei Test**:
    - Iniziare dal flow **Guest Access** (Public API).
    - Eliminare i vari `createMockD1ForInsert`, `createMockD1ForList` ecc. a favore dell'uso di `StaticContentRepository`.

---

## Esempio di Flow Test (Nuovo Stile)

```typescript
it('Flow: Utente pubblica un articolo e lo visualizza', async () => {
  const repo = new StaticContentRepository(testSeeds);
  const app = createBeechApp({ seeds: testSeeds });

  // Iniezione del mock repository sovrascrivendo la variabile di contesto
  app.use('*', async (c, next) => {
    c.set('repository', repo);
    await next();
  });

  // 1. Creazione (POST)
  const postRes = await app.request('/api/v1/public/posts/add', {
    method: 'POST',
    body: JSON.stringify({ title: 'Nuovo Post' }),
    headers: { 'X-API-Key': 'write-key' }
  });
  const { id } = await postRes.json();

  // 2. Lettura (GET) - Il repository in-memory deve ora contenere l'entry
  const getRes = await app.request(`/api/v1/public/posts/${id}`, {
    headers: { 'X-API-Key': 'read-key' }
  });
  const { data } = await getRes.json();
  
  expect(data.title).toBe('Nuovo Post');
});
```
