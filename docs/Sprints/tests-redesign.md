# Sprint: Riscrizione Test BeechCMS

Questo documento delinea il piano per la modernizzazione della suite di test di BeechCMS, passando da test isolati e "antiquati" a test di integrazione orientati ai **flow** reali dell'utente, seguendo l'architettura Vertical Slice.

## Obiettivi (COMPLETATO)
- [x] Sostituire i mock frammentati con un layer di database "statico" alimentato dai Seed.
- [x] Coprire i flow principali dell'applicazione.
- [x] Testare sistematicamente: valori attesi, valori errati e edge case.
- [x] Eliminare i test obsoleti e fragili basati su mock diretti di D1.

## Architettura dei Test
Ogni test utilizza un **Static Repository Layer** che garantisce determinismo totale e indipendenza dall'infrastruttura Cloudflare reale durante i test.

### Pattern di iniezione
`BeechConfig` in `createBeechApp` accetta repository custom per l'iniezione delle dipendenze.

```typescript
const repo = new StaticContentRepository(testSeeds)
const app = createBeechApp({ seeds: testSeeds, repository: repo })
```

---

## Stato Avanzamento Flow

### 1. Flow: Guest Access (Public API) - **COMPLETATO**
- [x] GET /api/v1/public/:seed (Lista con filtri e policy)
- [x] GET /api/v1/public/:seed?slug=... (Dettaglio via query)
- [x] POST /api/v1/public/:seed/add (Invio form con idempotenza)
- [x] PUT /api/v1/public/:seed/edit/:id (Public Edit con UUID)
- [x] Rate Limiting e API Key Auth.

### 2. Flow: Admin Authentication - **COMPLETATO**
- [x] Login con password hashing (bcrypt).
- [x] Token rotation (Access + Refresh).
- [x] Logout e revoca sessioni.

### 3. Flow: Content Management (Protected API) - **COMPLETATO**
- [x] Admin CRUD completo.
- [x] Gestione automatica slug e audit logs.
- [x] Filtri complessi e ricerca per seed.

### 4. Flow: Draft Management (Mirror Tables) - **COMPLETATO**
- [x] Save draft / Get draft.
- [x] Publish draft (Atomic promotion).
- [x] Discard draft.

### 5. Flow: Media & Assets (R2) - **COMPLETATO**
- [x] Upload con validazione MIME/Size.
- [x] Media serving e deletion con cleanup R2.

### 6. Flow: System & Schema - **COMPLETATO**
- [x] Dinamismo delle definizioni Seed via API.
- [x] General Settings.

---

## Pulizia Finale (COMPLETATO)
Abbiamo eliminato tutti i vecchi test che utilizzavano `MockD1Database` manuale o che testavano la logica in modo frammentato:
- Eliminati `auth.test.ts`, `content.test.ts`, `upload.test.ts`, ecc.
- Eliminati i test unitari nelle feature (`src/features/...`) sostituiti dai test di flow.
- Consolidata la suite in 11 file di test puliti e deterministici.

## CI/CD (COMPLETATO)
- [x] Aggiornato `.github/workflows/test.yml` per eseguire la nuova suite deterministica.

---

**Sprint concluso con successo. La suite di test è ora robusta, veloce e allineata all'architettura Vertical Slice.**
