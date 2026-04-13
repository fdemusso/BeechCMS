# Media Engine – Upload e servizio file (R2)

Documentazione del sistema di upload e distribuzione media per Beech CMS. I file vengono caricati su Cloudflare R2 e serviti tramite l'API.

**Vedi anche:**
- [Field Renderers](field-renderers.md) — tipo `file` (MediaEdit, MediaDisplay)
- [Content Engine](content-engine.md) — storage dell'URL in `data`

---

## 1. Architettura

```
Dashboard (MediaEdit)  →  POST /api/upload (JWT)  →  R2 (S3 API)
                              ↓
                         { url: "..." }
                              ↓
                    onChange(url) → salvataggio in data

GET /api/media/:key (pubblico)  →  R2  →  Response (immagine)
```

- **Storage**: URL in `data` (colonna JSON): `string` per `file` singolo, `string[]` per `asset-list` (`file` multiplo). I binari restano in R2.
- **API S3-compatibile**: Uso di `@aws-sdk/client-s3` con chiavi di accesso per portabilità.

---

## 2. Configurazione

### Variabili obbligatorie

| Variabile | Descrizione | Dove |
|-----------|-------------|------|
| `R2_ACCESS_KEY_ID` | Access Key da Cloudflare R2 | `.dev.vars` (locale) / `wrangler secret` (prod) |
| `R2_SECRET_ACCESS_KEY` | Secret Key | idem |
| `R2_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` | `.dev.vars` o `vars` in wrangler |
| `R2_BUCKET_NAME` | Nome del bucket (es. `beech-media`) | idem |

### Variabili opzionali

| Variabile | Descrizione |
|-----------|-------------|
| `MEDIA_BASE_URL` | URL base per gli URL restituiti. Se assente, usa l'origin della richiesta. In dev con proxy Vite: `http://localhost:5173` |

### Setup locale

1. Crea il bucket: `npx wrangler r2 bucket create beech-media`
2. Crea le chiavi: Dashboard Cloudflare → R2 → Manage R2 API Tokens
3. Copia `.dev.vars.example` in `.dev.vars` e compila i valori
4. `.dev.vars` è in `.gitignore` — non committare mai le chiavi

### Setup produzione

```bash
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY
```

Imposta `R2_ENDPOINT` e `R2_BUCKET_NAME` in `vars` in `wrangler.jsonc` o via secrets.

---

## 3. API Reference

### POST /api/upload

Carica un file su R2. Richiede JWT.

**Request:** `Content-Type: multipart/form-data`, campo `file`

**Validazione:**
- MIME: `image/*`, `application/pdf`
- Dimensione max: 5 MB
- Robustezza Cloudflare/Workers: il valore di `formData.get('file')` può arrivare come `File`/`Blob`-like (o `string` non valido); l'API valida che esponga `name`, `type`, `size`, `arrayBuffer` prima di procedere.

**Response 200:**
```json
{ "url": "https://.../api/media/1739123456-avatar.png" }
```

**Errori:** 400 (file mancante/invalido), 401 (non autenticato), 500 (R2 non configurato o errore upload)

### GET /api/media/:key

Serve un file da R2. Route pubblica (nessuna auth).

**Response:** Body del file con `Content-Type` e `Cache-Control: public, max-age=31536000, immutable`

**Errori:** 404 (file non trovato)

### 3.1 Cleanup alla cancellazione entry

Quando si elimina un'entry (`DELETE /api/content/:slug/:id`), i file referenziati nei campi `file` (singolo o lista) e `json` vengono eliminati anche da R2.

**Flusso:** L'API legge il `data` dell'entry (formato DB, chiavi = branch ID), estrae le chiavi R2 dagli URL `/api/media/KEY`
anche in strutture annidate o JSON serializzati legacy, e invia `DeleteObjectCommand` per ogni chiave. Poi procede con la delete dal DB.

**Robustezza:** Se R2 non è configurato o la delete su R2 fallisce, l'entry viene comunque eliminata dal DB (priorità: non bloccare la cancellazione).

**Limitazioni:** I campi `richtext` non vengono analizzati (eventuali `<img src="/api/media/...">` nel body restano su R2).

---

## 4. Field Renderers

| Componente | File | Descrizione |
|------------|------|-------------|
| MediaEdit | `edit/media.tsx` | Dropzone, upload, anteprima, Sostituisci/Rimuovi |
| MediaDisplay | `display/media.tsx` | Miniatura (Avatar) per immagini, icona File per altri |

Il tipo `file` in `BranchType` salva un URL singolo o una lista URL (`multiple: true` / `format: 'asset-list'`). Vedi [Field Renderers](field-renderers.md).

---

## 5. File e moduli

| File | Descrizione |
|------|-------------|
| `apps/api/src/upload.ts` | POST upload, `deleteR2Objects`, serve media |
| `apps/api/src/media-utils.ts` | `extractMediaKey`, `extractMediaKeysFromData` (estrazione chiavi da entry) |
| `apps/api/.dev.vars.example` | Template per variabili locali |
