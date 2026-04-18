/**
 * Media Engine: upload e servizio file da Cloudflare R2.
 *
 * Usa l'API S3-compatibile (@aws-sdk/client-s3) con chiavi di accesso per
 * portabilità e configurabilità. Le credenziali vanno in .dev.vars (locale)
 * o wrangler secret (produzione).
 *
 * @see docs/media-engine.md
 */
/// <reference types="@cloudflare/workers-types" />
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { Hono } from 'hono'
import { authMiddleware } from './middleware'
import { logActivity } from './shared/activity-logger'

/** Variabili d'ambiente per upload e media (R2 via S3 API) */
type UploadBindings = {
  JWT_SECRET: string
  MEDIA_BASE_URL?: string
  ENV?: string
  R2_ACCESS_KEY_ID?: string
  R2_SECRET_ACCESS_KEY?: string
  R2_ENDPOINT?: string
  R2_BUCKET_NAME?: string
  DB: D1Database
}

type Variables = {
  jwtPayload: { sub: string; email?: string }
}

/** Prefissi MIME consentiti (immagini e PDF) */
const ALLOWED_MIME_PREFIXES = ['image/', 'application/pdf']

/** Dimensione massima file: 5 MB */
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024

type FileLike = {
  name: string
  type: string
  size: number
  arrayBuffer: () => Promise<ArrayBuffer>
}

function isFileLike(value: unknown): value is FileLike {
  if (!value || typeof value === 'string') return false
  const v = value as Record<string, unknown>

  return (
    typeof v.name === 'string' &&
    typeof v.type === 'string' &&
    typeof v.size === 'number' &&
    typeof v.arrayBuffer === 'function'
  )
}

/** Sanitizza il nome file: rimuove caratteri non sicuri, mantiene estensione */
function sanitizeFilename(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
  return base || 'file'
}

/** Genera chiave univoca per R2 (timestamp-sanitized-name) */
function generateObjectKey(originalName: string): string {
  const timestamp = Math.floor(Date.now() / 1000)
  const sanitized = sanitizeFilename(originalName)
  return `${timestamp}-${sanitized}`
}

/** Restituisce l'URL base per costruire gli URL pubblici dei media */
function getMediaBaseUrl(c: { req: { url: string }; env: UploadBindings }): string {
  const base = c.env.MEDIA_BASE_URL?.trim()
  if (base) return base.replace(/\/$/, '')
  return new URL(c.req.url).origin
}

/** Crea client S3 per R2 */
export function createR2Client(env: UploadBindings): S3Client {
  if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_ENDPOINT) {
    throw new Error('R2 credentials not configured')
  }
  return new S3Client({
    region: 'auto',
    endpoint: env.R2_ENDPOINT,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID!,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    },
    forcePathStyle: true,
  })
}

/** Env minimale per delete R2 (solo R2_* e ENV) */
export type R2DeleteEnv = Pick<
  UploadBindings,
  'R2_ACCESS_KEY_ID' | 'R2_SECRET_ACCESS_KEY' | 'R2_ENDPOINT' | 'R2_BUCKET_NAME' | 'ENV' | 'DB'
>

/**
 * Elimina oggetti da R2 per le chiavi date.
 * Usato alla cancellazione entry per rimuovere i file associati da R2.
 */
export async function deleteR2Objects(
  env: R2DeleteEnv,
  objectKeys: string[]
): Promise<void> {
  const isR2Configured =
    env.R2_ACCESS_KEY_ID &&
    env.R2_SECRET_ACCESS_KEY &&
    env.R2_ENDPOINT &&
    env.R2_BUCKET_NAME

  if (!isR2Configured || objectKeys.length === 0) {
    return
  }

  const s3Client = createR2Client(env as UploadBindings)
  for (const objectKey of objectKeys) {
    try {
      // Ottieni la dimensione prima della cancellazione per aggiornare il contatore
      let fileSize = 0
      try {
        const head = await s3Client.send(
          new HeadObjectCommand({
            Bucket: env.R2_BUCKET_NAME,
            Key: objectKey,
          })
        )
        fileSize = head.ContentLength ?? 0
      } catch (headErr) {
        // Se il file non esiste già su R2, fileSize resta 0
        if (env.ENV !== 'production') {
          console.warn('R2 head failed for key (skip size update)', objectKey, headErr)
        }
      }

      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: env.R2_BUCKET_NAME,
          Key: objectKey,
        })
      )

      // Decrementa contatore storage in D1 se abbiamo trovato la dimensione
      if (fileSize > 0) {
        await env.DB.prepare(
          "UPDATE system_stats SET value = MAX(0, CAST(value AS INTEGER) - ?) WHERE id = 'total_storage_bytes'"
        ).bind(fileSize).run()
      }
    } catch (err) {
      if (env.ENV !== 'production') {
        console.warn('R2 delete failed for key', objectKey, err)
      }
    }
  }
}

export const uploadRoutes = new Hono<{
  Bindings: UploadBindings
  Variables: Variables
}>()

/** POST /upload - Carica file su R2, restituisce URL pubblico */
uploadRoutes.post('/upload', async (c, next) => {
  await authMiddleware(c.env.JWT_SECRET)(c, next)
}, async (c) => {
  try {
    const { R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET_NAME } = c.env
    if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_ENDPOINT || !R2_BUCKET_NAME) {
      return c.json({ error: 'R2 not configured. Set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET_NAME' }, 500)
    }

    const contentType = c.req.header('Content-Type') ?? ''
    if (!contentType.includes('multipart/form-data')) {
      return c.json({ error: 'Content-Type must be multipart/form-data' }, 400)
    }

    const formData = await c.req.formData()
    const fileEntry = formData.get('file')
    // In Cloudflare/Workers il value può essere `string` o un oggetto (File/Blob-like).
    // Usiamo un guard sulle proprietà richieste.
    if (!isFileLike(fileEntry)) {
      return c.json({ error: 'No file provided. Use field name "file"' }, 400)
    }
    const file = fileEntry

    const mimeOk = ALLOWED_MIME_PREFIXES.some((prefix) => file.type.startsWith(prefix))
    if (!mimeOk) {
      return c.json(
        { error: 'File type not allowed. Allowed: images and PDF' },
        400
      )
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return c.json({ error: 'File too large. Max 5MB' }, 400)
    }

    const objectKey = generateObjectKey(file.name)
    const client = createR2Client(c.env)

    const body = await file.arrayBuffer()
    await client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: objectKey,
        Body: new Uint8Array(body),
        ContentType: file.type,
      })
    )

    // Aggiorna contatore storage in D1
    c.executionCtx.waitUntil((async () => {
      try {
        await c.env.DB.prepare(
          "UPDATE system_stats SET value = CAST(value AS INTEGER) + ? WHERE id = 'total_storage_bytes'"
        ).bind(file.size).run()
      } catch (err) {
        console.error('Failed to update storage stats on upload:', err)
      }
    })())

    const baseUrl = getMediaBaseUrl(c)
    const publicUrl = `${baseUrl}/api/media/${encodeURIComponent(objectKey)}`

    logActivity(c, {
      action: 'upload',
      entityType: 'media',
      entityId: objectKey,
      details: { name: file.name, size: file.size, type: file.type }
    })

    return c.json({ url: publicUrl }, 200)
  } catch (err) {
    if (c.env.ENV !== 'production') {
      console.error('Upload error:', err)
    }
    return c.json({ error: 'Upload failed' }, 500)
  }
})

/** DELETE /upload/:key - Elimina un file da R2 */
uploadRoutes.delete('/:key', async (c, next) => {
  await authMiddleware(c.env.JWT_SECRET)(c, next)
}, async (c) => {
  const key = c.req.param('key')
  if (!key) return c.json({ error: 'Missing key' }, 400)
  
  await deleteR2Objects(c.env, [decodeURIComponent(key)])
  return c.json({ success: true }, 200)
})

/**
 * Serve un file da R2. Route pubblica (senza auth) per permettere
 * il caricamento delle immagini nei tag <img>.
 */
export async function serveMediaHandler(
  c: { env: UploadBindings; req: { param: (key: string) => string } }
): Promise<Response> {
  const key = c.req.param('key')
  if (!key) {
    return new Response(JSON.stringify({ error: 'Missing key' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET_NAME } = c.env
  if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_ENDPOINT || !R2_BUCKET_NAME) {
    return new Response(JSON.stringify({ error: 'R2 not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const client = createR2Client(c.env)
    const response = await client.send(
      new GetObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: decodeURIComponent(key),
      })
    )

    if (!response.Body) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const headers = new Headers()
    const ct = response.ContentType ?? 'application/octet-stream'
    headers.set('Content-Type', ct)
    headers.set('Cache-Control', 'public, max-age=31536000, immutable')

    return new Response(response.Body as ReadableStream, {
      status: 200,
      headers,
    })
  } catch {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
