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

- Variabile richiesta: `PUBLIC_API_KEY`.
- Priorita key: header `X-API-Key` > query param `?key=`.
- Errori:
  - `403` quando `PUBLIC_API_KEY` non e configurata.
  - `401` quando la key e mancante o invalida.

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
2. Parse JSON body.
3. Verifica `data` come oggetto non vuoto.
4. Validazione/sanitizzazione schema-driven tramite core (`validateAndSanitizeSeedPayload` via adapter API).
5. Verifica unicita slug.
6. Insert con prepared statement.

Comportamenti principali:

- `status` valido: `draft | review | published`.
- `slug`:
  - se presente, viene slugified;
  - se assente, viene generato da `title` o `name`;
  - fallback finale UUID corto.
- Rich text pericoloso (es. `<script>`): `422 Unprocessable Entity`.
- Errori di tipo/validazione: `400` con `details`.
- Successo: `201 { success: true, id, slug }`.

## PUT `/api/v1/public/:seed/edit/:id`

Pipeline:

1. Validazione seed.
2. Validazione UUID.
3. Verifica esistenza entry.
4. Parse body.
5. Merge parziale dei dati alias:
   - campi presenti sovrascrivono;
   - campi assenti restano invariati;
   - campi con `null` vengono rimossi.
6. Verifica unicita slug (escludendo la entry corrente).
7. Update con prepared statement.

Comportamenti principali:

- `status` valido: `draft | review | published`.
- `slug` opzionale: se presente deve essere stringa non vuota.
- Successo: `200 { success: true, id, slug }`.

## Note implementative

- La Public API usa il Botanical Engine (`getSeed`, `apiToDb`, `dbToApi`) e non accede direttamente ai campi interni `br_xxx`.
- Le utility query condivise sono centralizzate in `apps/api/src/shared/query-utils.ts`.
- In produzione (`ENV=production`) gli errori 500 sono resi con messaggio generico.
