# Public Slug API (`/api/v1/public`)

Layer pubblico per esporre i contenuti del CMS a client esterni (siti, app, integrazioni) con autenticazione tramite API Key.

## Endpoint disponibili

| Metodo | Path | Descrizione |
|---|---|---|
| GET | `/api/v1/public/health` | Smoke endpoint protetto da API Key |
| GET | `/api/v1/public/:seed` | Lettura contenuti per seed con query avanzate |
| POST | `/api/v1/public/:seed/add` | Creazione di una nuova entry |
| PUT | `/api/v1/public/:seed/edit/:id` | Aggiornamento parziale di una entry esistente |

## Autenticazione

- Variabili consigliate:
  - `PUBLIC_READ_API_KEY` per `GET`
  - `PUBLIC_WRITE_API_KEY` per `POST`/`PUT`
- La key e accettata solo via header `X-API-Key`.
- Errori:
  - `403` quando la key richiesta (read o write) non e configurata.
  - `401` quando la key e mancante o invalida.
  - `429` quando scatta il rate limit pubblico.
  - Error payload in formato Problem Details (`application/problem+json`) con campi legacy compatibili (`error`, `message`, `details`).

## Policy per seed (allowlist)

La Public API usa una policy per-seed nel `Seed Registry`:

- `allowPublicRead`: abilita `GET /:seed`
- `allowPublicPost`: abilita `POST /:seed/add`
- `allowPublicEdit`: abilita `PUT /:seed/edit/:id`

Default: **deny** su tutte le operazioni non esplicitamente abilitate.

Matrice attuale:

| Seed | Read | Post | Edit |
|---|---|---|---|
| `articoli` | si | no | no |
| `prodotti` | si | no | no |
| `team` | si | no | no |
| `testimonianze` | si | no | no |
| `pagine` | si | no | no |
| `messaggi` | no | si | si |

Esempio:

```bash
curl "http://localhost:8787/api/v1/public/articoli?latest=3" \
  -H "X-API-Key: dev-public-key-changeme"
```

## GET `/api/v1/public/:seed`

### Query params supportati

- `id`: recupera una singola entry per UUID.
- `all=true`: forza `page=1` e `limit=100`.
- `latest=N`: ultime `N` entry (`1..100`, default `10`) ordinate per `created_at DESC`.
- `filter=<json>`: filtri avanzati con `where` + `logic`.
- `search=<term>`: ricerca su `slug`, `status`, `data`.
- `page`, `limit`: paginazione (`limit` massimo `100`).
- `orderBy`, `orderDir`: ordinamento (`asc`/`desc`).
- `fields=a,b,c`: projection dei soli alias richiesti (i metadati base restano sempre inclusi).

### Formato risposta

- Singolo record:
  - `{ data: {...}, meta: { seed } }`
- Lista:
  - `{ data: [...], meta: { total, page, limit, returned, seed } }`
- Modalita `latest`:
  - `{ data: [...], meta: { total, returned, seed } }`

### Regole filtro

- Campi non riconosciuti: ignorati (safe policy).
- Operatore sconosciuto o valore incompatibile: `400 Bad Request`.
- `filter` malformato (JSON non valido): `400 Bad Request`.

Operatori supportati:

`eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`, `not_contains`, `starts_with`, `ends_with`, `is_empty`, `is_not_empty`, `in`, `not_in`, `has_tag`, `has_any_tag`, `has_all_tags`.

## POST `/api/v1/public/:seed/add`

Pipeline:

1. Validazione seed.
2. Verifica policy `allowPublicPost`.
3. Parse JSON body.
4. Verifica `data` come oggetto non vuoto.
5. Validazione/sanitizzazione schema-driven tramite core (`validateAndSanitizeSeedPayload` via adapter API).
6. Verifica idempotenza opzionale (`Idempotency-Key`) per retry sicuri.
7. Verifica unicita slug.
8. Insert con prepared statement.

Comportamenti principali:

- `status` valido: `draft | review | published`.
- `slug`:
  - se presente, viene slugified;
  - se assente, viene generato da `title` o `name`;
  - fallback finale UUID corto.
- Rich text pericoloso (es. `<script>`): `422 Unprocessable Entity`.
- Errori di tipo/validazione: `400` con `details`.
- Alias sconosciuti:
  - in ambienti deploy: rifiutati (`400`) con dettaglio field-level;
  - in sviluppo: configurabili via `PUBLIC_STRICT_UNKNOWN_ALIASES` (raccomandato `true`).
- Required fields per-seed (`requiredOnCreate`) enforced dal core in `operation=create`.
- Payload senza nessun campo valido dopo sanitizzazione: `400`.
- Campi media:
  - `file` singolo -> `string` URL HTTPS
  - `asset-list` (`file` con `multiple: true` o `format: 'asset-list'`) -> `string[]` URL HTTPS
- Idempotenza:
  - se `Idempotency-Key` e presente e la richiesta e uguale, viene restituita la risposta salvata;
  - se la stessa key viene riusata con payload diverso: `409 Conflict`.
- Successo: `201 { success: true, id, slug }`.

## PUT `/api/v1/public/:seed/edit/:id`

Pipeline:

1. Validazione seed.
2. Verifica policy `allowPublicEdit`.
3. Validazione UUID.
4. Verifica esistenza entry.
5. Parse body.
6. Merge parziale dei dati alias:
   - campi presenti sovrascrivono;
   - campi assenti restano invariati;
   - campi con `null` vengono rimossi.
7. Verifica unicita slug (escludendo la entry corrente).
8. Update con prepared statement.

Comportamenti principali:

- `status` valido: `draft | review | published`.
- `slug` opzionale: se presente deve essere stringa non vuota.
- Campi media multipli (`asset-list`) restano compatibili con payload legacy (`json`/oggetti con `url`) tramite normalizzazione nel core.
- `requiredOnUpdate` (se definito nel seed) viene enforced in `operation=update`.
- Patch senza campi validi (es. solo alias sconosciuti): `400`.
- Successo: `200 { success: true, id, slug }`.

## Error Model (Problem Details)

Le risposte errore della Public API usano un envelope Problem Details:

- `type`: URI machine-readable del problema
- `title`: nome breve errore (es. `Bad Request`)
- `status`: HTTP status code
- `detail`: descrizione errore
- `instance`: path richiesta
- `errors[]`: opzionale, dettagli field-level per errori di validazione

Compatibilita retro: sono mantenuti anche `error`, `message` e `details` per i client esistenti.

## Note implementative

- La Public API usa il Botanical Engine (`getSeed`, `apiToDb`, `dbToApi`) e non accede direttamente ai campi interni `br_xxx`.
- Le utility query condivise sono centralizzate in `apps/api/src/shared/query-utils.ts`.
- In produzione (`ENV=production`) gli errori 500 sono resi con messaggio generico.
- Rate limiting dedicato per route pubbliche:
  - `PUBLIC_READ_RATE_LIMITER` per GET
  - `PUBLIC_WRITE_RATE_LIMITER` per POST/PUT
- Visibilita default sui contenuti pubblici: solo `status='published'` (`PUBLIC_PUBLISHED_ONLY=true`).
- Hardening consigliato per deploy: `PUBLIC_STRICT_UNKNOWN_ALIASES=true` (fail-closed sui write endpoint).
