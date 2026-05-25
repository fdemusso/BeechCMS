# Sprint: Migrazione Upload Media a URL Presigned (single path)

Questo documento è una **specifica eseguibile**: ogni task contiene path assoluti, snippet del codice attuale, contratti precisi e criteri di accettazione. Un agente IA deve poterla completare senza ulteriore navigazione del codice (a parte i file elencati).

> Versione: 2.0 — Allineata con il codice su branch `seed-bugfix`.
> Issue di riferimento: migrazione del Media Engine da upload proxied (via Worker) a presigned URL (client → R2 diretto).

---

## 0. Principio guida (READ-FIRST)

**Beech è in beta (0.5): niente codice legacy, niente fallback, niente rami "both ways".**

Il Worker NON deve più ricevere bytes di file. La rotta `POST /upload` proxied viene **rimossa**, non deprecata. Il binding nativo `R2BindingBucket` viene **eliminato**: non supporta presigning, quindi diventa un ramo morto. In sviluppo locale si usa lo stesso `S3Bucket` puntato a un MinIO containerizzato (o direttamente al bucket R2 di staging via credenziali dev), così il codice di prod e quello di dev seguono lo stesso path.

| Decisione | Valore | Motivo |
|---|---|---|
| Path unico storage | `S3Bucket` (HTTP S3-compatibile) | Funziona ovunque: R2 in prod, MinIO/R2 in dev. Permette presigning sempre. |
| `R2BindingBucket` | **Rimosso** | Non supporta presigning. Tenerlo significherebbe due code-path. |
| `POST /upload` (proxied) | **Rimosso** | Era pensato per il binding nativo. Niente fallback. |
| `MEDIA_BUCKET` binding in `wrangler.jsonc` | **Rimosso** | Sostituito da `R2_*` env/secret. |
| TTL presigned PUT | `900` s (15 min) | UX vs superficie d'attacco. |
| TTL presigned GET | `900` s | Allineato al PUT. |
| Max upload size default | `50 * 1024 * 1024` (50 MB) | Eleva il vecchio cap 5 MB. |
| Hard cap assoluto | `500 * 1024 * 1024` (500 MB) | Limite non superabile via env. |
| MIME accettati | `ALLOWED_MIME_PREFIXES` (`image/*`, `application/pdf`) | Invariato; validati al presign. |
| Idempotenza confirm | `mediaRepository.getByKey(key)` prima del track | Doppio confirm sullo stesso key non duplica righe né stats. |
| Formato URL pubblico | `bucket.getUrl(key)` (CDN o proxy `/api/media/:key`) | Nessuna breaking change su consumatori downstream. |
| Dev locale | `npm run dev:full` (avvia MinIO + API + Dashboard) | Docker è prerequisito di sviluppo. Documentato in `docs/development.md` e con warning in README e CLAUDE.md. |
| `npm run dev` | Mantenuto ma con **warning prominente**: upload non funzionano senza MinIO attivo | Onboarding chiaro: o usi `dev:full`, o avvii `docker compose up -d minio` a parte. |

---

## 1. Contesto e parti coinvolte

### 1.1 File coinvolti

| Layer | File | Azione |
|---|---|---|
| Core types | `packages/core/src/storage.ts` | **Modificare** — aggiungere `presignPut` e `presignGet` come metodi **non opzionali**. |
| API upload | `apps/api/src/upload.ts` | **Riscrivere** — eliminare `POST /upload` proxied, aggiungere `/upload/presign` e `/upload/confirm`. |
| Storage S3 | `apps/api/src/shared/storage/s3-bucket.ts` | **Estendere** — implementare `presignPut`/`presignGet`. |
| Storage R2 binding | `apps/api/src/shared/storage/r2-binding-bucket.ts` | **Eliminare**. |
| Factory storage | `apps/api/src/shared/storage/factory.ts` | **Semplificare** — solo `S3Bucket`, `NullBucket` resta come guardia errore. |
| Env types | `apps/api/src/types.ts` | Rimuovere `MEDIA_BUCKET`; aggiungere `MAX_UPLOAD_BYTES?`. |
| Wrangler config | `apps/api/wrangler.jsonc` | Rimuovere `r2_buckets`; documentare `R2_*` come secret. |
| Media repo | `apps/api/src/shared/media.repository.d1.ts` | Invariato (`trackUpload`, `getByKey`, `untrack`). |
| System stats | `apps/api/src/shared/system-stats.repository.d1.ts` | Invariato (`incrementStorage`, `decrementStorage`). |
| Validation MIME | `packages/core/src/` (`isMimeAccepted`) | Invariato. |
| Dashboard edit | `apps/dashboard/src/features/fields/edit/media.tsx` | Sostituire `handleFileUpload` — solo flusso presign+confirm. |
| Dashboard richtext | `apps/dashboard/src/features/richtext-editor/components/RichtextEditor.tsx` | Stesso refactor. |
| Utility client | `apps/dashboard/src/lib/upload.ts` (nuovo) | Estrazione `uploadFile(file)` condivisa. |
| Dev infra | `docker-compose.yml` (nuovo, root repo) | MinIO + init bucket. |
| Docs | `docs/development.md` (nuovo o esistente), `docs/api-reference.md`, `docs/architecture.md` | Documentare setup dev + nuovi endpoint. |
| Tests | `apps/api/test/upload.test.ts` | Riscrivere per la nuova API. |

### 1.2 Snippet di partenza (per riferimento, NON rileggere)

**`apps/api/src/upload.ts` L11–14 — limite attuale da rimuovere**
```typescript
/** Dimensione massima file: 5 MB */
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024
```

**`apps/api/src/shared/storage/factory.ts` L23–39 — selezione attuale**
```typescript
export function createBucketProvider(env: Env, baseUrl: string): BeechBucket {
  if (env.MEDIA_BUCKET) return new R2BindingBucket(env.MEDIA_BUCKET, baseUrl)
  if (env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_ENDPOINT && env.R2_BUCKET_NAME) {
    return new S3Bucket({ /* ... */ })
  }
  return new NullBucket()
}
```

**`apps/api/src/shared/storage/s3-bucket.ts` L23–31 — client S3 già pronto per presigner**
```typescript
this.client = new S3Client({
  region: 'auto',
  endpoint: config.endpoint,
  credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  forcePathStyle: true,
})
```

**`apps/dashboard/src/features/fields/edit/media.tsx` L167–169 — chiamata da sostituire**
```typescript
const formData = new FormData()
formData.append("file", file)
const { data } = await api.post<{ url: string }>("/upload", formData)
```

---

## 2. Task 1 — Pulizia: rimozione binding nativo e proxy upload

### 2.1 Eliminare file

- `apps/api/src/shared/storage/r2-binding-bucket.ts` → rimosso.

### 2.2 `apps/api/src/shared/storage/factory.ts`

Sostituire interamente con:

```typescript
import { BeechBucket, PutBucketOptions, GetBucketResult } from '@beechcms/core'
import { Env } from '../../types'
import { S3Bucket } from './s3-bucket'

class NullBucket implements BeechBucket {
  private fail(): never {
    throw new Error('Storage not configured. Set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME.')
  }
  put(): Promise<void> { return this.fail() }
  get(): Promise<GetBucketResult | null> { return this.fail() }
  delete(): Promise<void> { return this.fail() }
  head(): Promise<{ size: number } | null> { return this.fail() }
  getUrl(): string { return this.fail() }
  getTotalSize(): Promise<number> { return this.fail() }
  list(): Promise<{ objects: Array<{ key: string; size: number }>; cursor?: string }> { return this.fail() }
  presignPut(): Promise<string> { return this.fail() }
  presignGet(): Promise<string> { return this.fail() }
}

/**
 * Single storage path: S3-compatible HTTP API.
 * Prod → Cloudflare R2 with S3 API token.
 * Dev  → MinIO container (or R2 staging bucket).
 */
export function createBucketProvider(env: Env, baseUrl: string): BeechBucket {
  if (env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_ENDPOINT && env.R2_BUCKET_NAME) {
    return new S3Bucket({
      endpoint: env.R2_ENDPOINT,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      bucketName: env.R2_BUCKET_NAME,
      baseUrl,
      cdnUrl: env.MEDIA_CDN_URL?.trim().replace(/\/$/, '') || undefined,
    })
  }
  return new NullBucket()
}
```

### 2.3 `apps/api/src/types.ts`

- Rimuovere il campo `MEDIA_BUCKET?: R2Bucket` da `Env`.
- Aggiungere `MAX_UPLOAD_BYTES?: string`.

### 2.4 `apps/api/wrangler.jsonc`

- Rimuovere l'intera sezione `r2_buckets`.
- Sostituire il commento R2 con istruzioni per i secret S3:
  ```
  // R2 (S3 API). In dev imposta in .dev.vars; in prod come wrangler secret:
  //   R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
  //   MEDIA_CDN_URL (opzionale)
  //   MAX_UPLOAD_BYTES (opzionale, default 50MB)
  ```

### 2.5 Accettazione

- Grep `MEDIA_BUCKET` su tutto il repo: zero match nel codice sorgente (i match nel docs vanno aggiornati al Task 8).
- Grep `R2BindingBucket`: zero match.
- `npm run build` in `apps/api` compila pulito.

---

## 3. Task 2 — `BeechBucket`: presigning obbligatorio

### 3.1 `packages/core/src/storage.ts`

Aggiungere all'interfaccia (senza `?`):

```typescript
export interface PresignOptions {
  /** Durata della URL in secondi. */
  expiresIn: number
  /** Content-Type vincolato sulla firma (PUT). */
  contentType?: string
  /** Content-Length atteso in bytes (PUT). */
  contentLength?: number
}

export interface BeechBucket {
  // ... metodi esistenti ...

  /** Genera URL firmata per upload diretto (PUT). */
  presignPut(key: string, options: PresignOptions): Promise<string>

  /** Genera URL firmata per lettura diretta (GET). */
  presignGet(key: string, options: PresignOptions): Promise<string>
}
```

### 3.2 Accettazione

- `npm run build` in `packages/core` passa.
- TypeScript segnala errori in qualsiasi punto del repo che istanzia `BeechBucket` senza implementare i nuovi metodi (utile a verificare il Task 1).

---

## 4. Task 3 — `S3Bucket.presignPut` / `presignGet`

### 4.1 Dipendenza

Verificare `apps/api/package.json`. Se mancante:
```bash
npm i @aws-sdk/s3-request-presigner --workspace apps/api
```

### 4.2 `apps/api/src/shared/storage/s3-bucket.ts`

Aggiungere import e metodi:

```typescript
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { PresignOptions } from '@beechcms/core'

// dentro la classe:

async presignPut(key: string, options: PresignOptions): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: this.bucketName,
    Key: key,
    ContentType: options.contentType,
    ContentLength: options.contentLength,
  })
  return getSignedUrl(this.client, command, { expiresIn: options.expiresIn })
}

async presignGet(key: string, options: PresignOptions): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: this.bucketName,
    Key: key,
  })
  return getSignedUrl(this.client, command, { expiresIn: options.expiresIn })
}
```

### 4.3 Accettazione

- `bucket.presignPut('k', { expiresIn: 900, contentType: 'image/png', contentLength: 1234 })` ritorna URL contenente `X-Amz-Signature`, `X-Amz-Expires=900`.
- Test di integrazione: PUT effettivo contro MinIO con quella URL restituisce 200; PUT con `Content-Type` divergente restituisce 403.

---

## 5. Task 4 — Riscrittura `apps/api/src/upload.ts`

Sostituire l'intero file con:

```typescript
/**
 * Media Engine — Single-path presigned uploads.
 * Il Worker non riceve mai i bytes: agisce solo da gatekeeper (auth, validazione, firma).
 */
import { Hono } from 'hono'
import { isMimeAccepted } from '@beechcms/core'
import { AppEnv } from './types'

const DEFAULT_MAX_UPLOAD_BYTES = 50 * 1024 * 1024
const ABSOLUTE_MAX_UPLOAD_BYTES = 500 * 1024 * 1024
const PRESIGN_TTL_SECONDS = 900

function resolveMaxUploadBytes(env: { MAX_UPLOAD_BYTES?: string }): number {
  const raw = env.MAX_UPLOAD_BYTES
  if (!raw) return DEFAULT_MAX_UPLOAD_BYTES
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_UPLOAD_BYTES
  return Math.min(parsed, ABSOLUTE_MAX_UPLOAD_BYTES)
}

function sanitizeFilename(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
  return base || 'file'
}

function generateObjectKey(originalName: string): string {
  const timestamp = Math.floor(Date.now() / 1000)
  return `${timestamp}-${sanitizeFilename(originalName)}`
}

export async function deleteR2Objects(
  c: { var: { bucket: any, mediaRepository: any, systemStatsRepository: any } },
  objectKeys: string[]
): Promise<void> {
  const { bucket, mediaRepository, systemStatsRepository } = c.var
  for (const key of objectKeys) {
    try {
      const media = await mediaRepository.getByKey(key)
      const size = media?.size_bytes ?? 0
      await bucket.delete(key)
      await mediaRepository.untrack(key)
      if (size > 0) await systemStatsRepository.decrementStorage(size)
    } catch (err) {
      console.warn(`Failed to delete media object: ${key}`, err)
    }
  }
}

export const uploadRoutes = new Hono<AppEnv>()

/** POST /upload/presign — Richiede URL firmata per upload diretto a R2. */
uploadRoutes.post('/upload/presign', async (c) => {
  let body: { filename?: unknown, mimeType?: unknown, sizeBytes?: unknown }
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }

  const { filename, mimeType, sizeBytes } = body
  if (typeof filename !== 'string' || !filename.trim()) return c.json({ error: 'filename is required' }, 400)
  if (typeof mimeType !== 'string' || !mimeType.trim()) return c.json({ error: 'mimeType is required' }, 400)
  if (typeof sizeBytes !== 'number' || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return c.json({ error: 'sizeBytes must be a positive number' }, 400)
  }

  const maxBytes = resolveMaxUploadBytes(c.env)
  if (sizeBytes > maxBytes) return c.json({ error: `File too large. Max ${maxBytes} bytes` }, 400)
  if (!isMimeAccepted(mimeType, 'any')) return c.json({ error: 'File type not allowed' }, 400)

  const key = generateObjectKey(filename)
  const uploadUrl = await c.var.bucket.presignPut(key, {
    expiresIn: PRESIGN_TTL_SECONDS,
    contentType: mimeType,
    contentLength: sizeBytes,
  })

  return c.json({ uploadUrl, key, expiresIn: PRESIGN_TTL_SECONDS }, 200)
})

/** POST /upload/confirm — Verifica l'oggetto su R2 e registra metadati. Idempotente sul key. */
uploadRoutes.post('/upload/confirm', async (c) => {
  const { bucket, mediaRepository: mediaRepo, systemStatsRepository: statsRepo } = c.var

  let body: { key?: unknown }
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }
  const { key } = body
  if (typeof key !== 'string' || !key.trim()) return c.json({ error: 'key is required' }, 400)

  // Idempotenza
  const existing = await mediaRepo.getByKey(key)
  if (existing) return c.json({ url: bucket.getUrl(key) }, 200)

  const head = await bucket.head(key)
  if (!head) return c.json({ error: 'Object not found in storage' }, 404)

  const uploadedBy = c.var.jwtPayload?.sub ?? ''
  const size = head.size ?? 0
  const mime = head.contentType ?? 'application/octet-stream'
  const filename = key.replace(/^\d+-/, '') || key

  await statsRepo.incrementStorage(size)
  await mediaRepo.trackUpload({
    key,
    filename,
    mime_type: mime,
    size_bytes: size,
    uploaded_by: uploadedBy,
  })

  const jwtPayload = c.get('jwtPayload')
  if (jwtPayload) {
    c.get('activityLogger').log({
      action: 'upload',
      entityType: 'media',
      entityId: key,
      details: { name: filename, size, type: mime },
      actor: {
        id: jwtPayload.sub,
        email: jwtPayload.email ?? 'unknown',
        name: jwtPayload.name ?? null,
      },
    })
  }

  return c.json({ url: bucket.getUrl(key) }, 200)
})

/** GET /upload/download-url/:key — URL firmata di lettura per asset privati. */
uploadRoutes.get('/upload/download-url/:key', async (c) => {
  const key = decodeURIComponent(c.req.param('key') ?? '')
  if (!key) return c.json({ error: 'Missing key' }, 400)

  const head = await c.var.bucket.head(key)
  if (!head) return c.json({ error: 'Object not found' }, 404)

  const downloadUrl = await c.var.bucket.presignGet(key, { expiresIn: PRESIGN_TTL_SECONDS })
  return c.json({ downloadUrl, expiresIn: PRESIGN_TTL_SECONDS }, 200)
})

/** DELETE /upload/:key — Invariato. */
uploadRoutes.delete('/upload/:key', async (c) => {
  const key = c.req.param('key')
  if (!key) return c.json({ error: 'Missing key' }, 400)
  await deleteR2Objects(c, [decodeURIComponent(key)])
  return c.json({ success: true }, 200)
})

/** Serve un file dallo storage (usato dalla rotta pubblica /api/media/:key). */
export async function serveMediaHandler(c: any): Promise<Response> {
  const key = c.req.param('key')
  if (!key) return new Response('Missing key', { status: 400 })
  try {
    const object = await c.var.bucket.get(decodeURIComponent(key))
    if (!object) return new Response('Not found', { status: 404 })
    const headers = new Headers()
    headers.set('Content-Type', object.contentType ?? 'application/octet-stream')
    headers.set('Cache-Control', 'public, max-age=31536000, immutable')
    return new Response(object.body, { status: 200, headers })
  } catch (err) {
    console.error(`[serveMediaHandler] Error serving file ${key}:`, err)
    return new Response('Internal error', { status: 500 })
  }
}
```

### 5.1 Accettazione

- Grep `POST /upload\b` (esattamente la rotta legacy) in `apps/api/src`: zero match.
- Tutte le auth/middleware esistenti (JWT, rate-limit) restano applicate via il montaggio in `factory.ts` esistente — verificare che il middleware JWT copra `/upload/presign`, `/upload/confirm`, `/upload/download-url/:key`.

---

## 6. Task 5 — Client dashboard: flusso unico

### 6.1 Nuovo file `apps/dashboard/src/lib/upload.ts`

```typescript
import { api } from './api'

export async function uploadFile(file: File): Promise<string> {
  const presign = await api.post<{ uploadUrl: string; key: string; expiresIn: number }>(
    '/upload/presign',
    { filename: file.name, mimeType: file.type, sizeBytes: file.size }
  )

  const putRes = await fetch(presign.data.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  })
  if (!putRes.ok) throw new Error(`Storage PUT failed: ${putRes.status}`)

  const confirm = await api.post<{ url: string }>('/upload/confirm', { key: presign.data.key })
  return confirm.data.url
}
```

### 6.2 `apps/dashboard/src/features/fields/edit/media.tsx`

Sostituire il blocco `handleFileUpload` (L157–186) con:

```typescript
import { uploadFile } from '@/lib/upload'

const handleFileUpload = React.useCallback(
  async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError(t('media.errorNotImage'))
      return
    }
    setError(null)
    setIsUploading(true)
    try {
      const url = await uploadFile(file)
      if (isMultiple) {
        const current = parseAssetListValue(value)
        onChange(appendUniqueUrl(current, url))
      } else {
        onChange(url)
        setIsModalOpen(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error during upload')
    } finally {
      setIsUploading(false)
    }
  },
  [isMultiple, onChange, value]
)
```

### 6.3 `apps/dashboard/src/features/richtext-editor/components/RichtextEditor.tsx`

Sostituire la chiamata `api.post('/upload', ...)` con `await uploadFile(file)` dalla utility appena creata.

### 6.4 Accettazione

- Grep `'/upload'` in `apps/dashboard/src`: zero match (solo `'/upload/presign'`, `'/upload/confirm'`, `'/upload/download-url'`).
- Grep `formData.append("file"` in `apps/dashboard/src`: zero match.

---

## 7. Task 6 — Dev infra: MinIO + `npm run dev:full`

> **Decisione:** Docker diventa prerequisito ufficiale di sviluppo. Beech ha superato la soglia di complessità in cui "basta Node" è realistico. Il comando di sviluppo canonico diventa `npm run dev:full`, che orchestra tutto.

### 7.1 Nuovo file `docker-compose.yml` (root repo)

```yaml
version: '3.9'
services:
  minio:
    image: minio/minio:latest
    container_name: beech-minio
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: beechdev
      MINIO_ROOT_PASSWORD: beechdevsecret
    command: server /data --console-address ":9001"
    volumes:
      - beech-minio-data:/data

  minio-init:
    image: minio/mc:latest
    depends_on: [minio]
    entrypoint: >
      /bin/sh -c "
      until /usr/bin/mc alias set local http://minio:9000 beechdev beechdevsecret; do sleep 1; done;
      /usr/bin/mc mb -p local/beech-media || true;
      /usr/bin/mc anonymous set download local/beech-media || true;
      "

volumes:
  beech-minio-data:
```

### 7.2 Script root `package.json`

Aggiungere/modificare gli script nel `package.json` di root:

```jsonc
{
  "scripts": {
    "dev": "turbo dev",
    "dev:full": "npm run dev:storage && turbo dev",
    "dev:storage": "docker compose up -d minio minio-init",
    "dev:storage:stop": "docker compose stop minio minio-init",
    "dev:storage:reset": "docker compose down -v minio"
  }
}
```

- `dev:full` → comando canonico per sviluppatori. Avvia MinIO in background poi parte con `turbo dev` come prima.
- `dev` → resta invariato (solo Turborepo). Vedi warning al §7.4.
- `dev:storage` → utility per chi vuole tenere lo storage acceso fra restart dei processi Node.

### 7.3 Nuovo file `apps/api/.dev.vars.example`

```
R2_ENDPOINT=http://localhost:9000
R2_ACCESS_KEY_ID=beechdev
R2_SECRET_ACCESS_KEY=beechdevsecret
R2_BUCKET_NAME=beech-media
MAX_UPLOAD_BYTES=52428800
```

L'utente copia `.dev.vars.example` in `apps/api/.dev.vars` (già git-ignored).

### 7.4 Warning su `npm run dev` "puro"

Lo script `npm run dev` resta funzionante perché alcuni dev potrebbero non lavorare sull'upload e voler evitare Docker. Va però accompagnato da segnali chiari ovunque:

**a) Banner nel terminale all'avvio dell'API.** In `apps/api/src/index.ts` (o nel modulo bootstrap del factory), aggiungere un check non bloccante che logga:

```typescript
// All'avvio del Worker in dev:
if (env.ENV === 'development') {
  fetch(env.R2_ENDPOINT + '/minio/health/live').catch(() => {
    console.warn(
      '\n⚠️  STORAGE NON RAGGIUNGIBILE su ' + env.R2_ENDPOINT + '\n' +
      '   Gli upload media falliranno. Avvia MinIO con:\n' +
      '     npm run dev:storage    (oppure usa "npm run dev:full" la prossima volta)\n'
    )
  })
}
```

> Il check è opzionale (best-effort): non blocca il boot, ma è impossibile da ignorare nel terminale.

**b) README root.** Sezione "Quick start" deve avere come *primo* comando `npm run dev:full` con una callout box che spiega perché. `npm run dev` documentato sotto come "advanced — assume storage già attivo".

**c) `CLAUDE.md` root.** Aggiornare la sezione **Commands → Root**:

```diff
- npm run dev        # Start API + Dashboard in parallel
+ npm run dev:full   # Comando canonico: avvia MinIO + API + Dashboard
+ npm run dev        # Solo API + Dashboard (richiede MinIO già attivo via `npm run dev:storage`)
```

**d) `docs/development.md`.** Sezione dedicata "Storage in development" che spiega:
- Perché serve MinIO (presigned URL richiedono S3 compatibile vero).
- Come avviarlo (`npm run dev:full` o `npm run dev:storage` separato).
- Come accedere alla console MinIO (`http://localhost:9001`, credenziali da `.dev.vars`).
- Come resettare lo stato (`npm run dev:storage:reset`).

### 7.5 Accettazione

- `npm run dev:full` da root: container MinIO up, bucket `beech-media` creato, API e Dashboard partono, upload end-to-end funziona (presign → PUT MinIO → confirm).
- `npm run dev` da root (senza MinIO): API e Dashboard partono lo stesso, ma compare il warning nel log API.
- `docker compose down -v` ripulisce completamente lo stato MinIO.
- README, CLAUDE.md e `docs/development.md` allineati come da §7.4.

---

## 8. Task 7 — Documentazione

### 8.1 `docs/api-reference.md`

Sezione **Media Engine** riscritta:

- `POST /upload/presign` — request `{ filename, mimeType, sizeBytes }` → `{ uploadUrl, key, expiresIn }`.
- `POST /upload/confirm` — request `{ key }` → `{ url }`. Idempotente.
- `GET /upload/download-url/:key` — `{ downloadUrl, expiresIn }`.
- `DELETE /upload/:key` — invariato.
- Sequenza completa client (presign → PUT → confirm) con diagramma.

### 8.2 `docs/architecture.md`

- Sezione **Media Engine** aggiornata: il Worker non gestisce più bytes di upload.
- Rimuovere tutti i riferimenti a `MEDIA_BUCKET` binding nativo e a `R2BindingBucket`.

### 8.3 `docs/development.md`

- Prerequisiti aggiornati: Node 20+, **Docker Desktop o Docker Engine** (nuovo).
- Quick start canonico: `npm run dev:full`.
- Sezione "Storage in development" come da §7.4d.
- Tabella comandi `npm run dev*` con casi d'uso.

### 8.4 `docs/guide.md`

Grep e aggiornare riferimenti a `MEDIA_BUCKET` o all'upload proxied.

### 8.5 `CLAUDE.md` (root)

Aggiornare la stringa nella sezione **Tech Stack Summary** che cita "R2" per chiarire che si usa l'API S3-compatibile in entrambi gli ambienti.

---

## 9. Task 8 — Test Vitest

### 9.1 Riscrivere `apps/api/test/upload.test.ts`

Casi minimi:

1. `POST /upload/presign` senza JWT → 401.
2. `POST /upload/presign` con body invalido → 400 (filename mancante, mimeType mancante, sizeBytes ≤ 0 o non numerico).
3. `POST /upload/presign` con MIME non consentito → 400.
4. `POST /upload/presign` con `sizeBytes` oltre `MAX_UPLOAD_BYTES` → 400.
5. `POST /upload/presign` happy path (mock `bucket.presignPut`) → 200 + `{ uploadUrl, key, expiresIn: 900 }`.
6. `POST /upload/confirm` senza JWT → 401.
7. `POST /upload/confirm` con `key` inesistente (`bucket.head` → null, `getByKey` → null) → 404.
8. `POST /upload/confirm` happy path → 200, `trackUpload` e `incrementStorage` chiamati una volta.
9. `POST /upload/confirm` con media già esistente (`getByKey` non-null) → 200, **nessuna** chiamata a `trackUpload`/`incrementStorage`.
10. `GET /upload/download-url/:key` con key inesistente → 404; happy path → 200 con `{ downloadUrl, expiresIn: 900 }`.

### 9.2 Accettazione

- `npm run test -w apps/api` passa.
- Rimuovere test obsoleti che colpivano `POST /upload` proxied: non devono restare scheletri commentati.

---

## 10. Acceptance Criteria finali (riepilogo issue)

- [ ] Non esiste più alcun path proxied per l'upload. Il Worker non riceve mai bytes di file.
- [ ] `R2BindingBucket` rimosso dal codice e dalla config Wrangler.
- [ ] `POST /api/upload/presign` ritorna una URL firmata valida (Sig V4) con TTL 900s.
- [ ] `POST /api/upload/confirm` verifica via `bucket.head(key)` e registra metadati su D1; doppio confirm idempotente.
- [ ] `GET /api/upload/download-url/:key` ritorna URL firmata di lettura.
- [ ] Limite dimensione enforced al presign, configurabile via `MAX_UPLOAD_BYTES` (default 50 MB, hard cap 500 MB).
- [ ] Dashboard e RichtextEditor usano la stessa utility `uploadFile()` — niente codice duplicato.
- [ ] `npm run dev:full` da root è sufficiente per avere l'ambiente di sviluppo completo (MinIO + API + Dashboard) con upload funzionante end-to-end.
- [ ] `npm run dev` puro mostra warning prominente se MinIO non è attivo.
- [ ] README, `CLAUDE.md` e `docs/development.md` documentano Docker come prerequisito ufficiale.
- [ ] Suite Vitest dell'API copre presign/confirm/download-url; nessun test residuo sul vecchio `/upload`.
- [ ] Documentazione (`api-reference`, `architecture`, `development`, `guide`) allineata.

---

## 11. Rischi e mitigazioni

| Rischio | Mitigazione |
|---|---|
| Client esegue PUT ma non chiama `/confirm` → oggetto orfano in R2 | Cron job di cleanup (fuori scope, da pianificare in sprint successivo): list R2 → confronta con `media_objects` → elimina orfani > 24h. |
| Client falsifica `sizeBytes` | `ContentLength` viene firmato dentro al `PutObjectCommand`: R2 rifiuta PUT con dimensioni divergenti (testare contro MinIO durante l'integrazione). |
| `Content-Type` del PUT divergente da quello firmato | R2/MinIO restituiscono 403. Documentare chiaramente nel client (`uploadFile` invia sempre lo stesso `file.type`). |
| Cambio credenziali invalida URL in flight | TTL 15 min limita la finestra di rotazione; non documentato come downtime ma da segnalare nel runbook. |
| MinIO in dev divergente da R2 in prod (es. policy CORS) | Documentare in `docs/development.md` la config CORS minima del bucket: `AllowedOrigins: ['*']` in dev, lista esplicita in prod. |
| Asset attualmente in produzione caricati via `/upload` | I file su R2 restano accessibili (le URL pubbliche sono identiche). Solo il path di scrittura cambia: nessuna migrazione dati richiesta. |
