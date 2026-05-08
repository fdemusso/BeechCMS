/**
 * Media Engine: upload e servizio file gestiti tramite BeechBucket e Repository.
 * 
 * Astrae lo storage (R2/S3) e il database (D1) per garantire scalabilità
 * e facilità di sviluppo locale.
 */
import { Hono } from 'hono'
import { AppEnv } from './types'

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

/** Sanitizza il nome file */
function sanitizeFilename(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
  return base || 'file'
}

/** Genera chiave univoca (timestamp-sanitized-name) */
function generateObjectKey(originalName: string): string {
  const timestamp = Math.floor(Date.now() / 1000)
  const sanitized = sanitizeFilename(originalName)
  return `${timestamp}-${sanitized}`
}

/**
 * Elimina oggetti dallo storage e tracciamento dal DB.
 */
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

      if (size > 0) {
        await systemStatsRepository.decrementStorage(size)
      }
    } catch (err) {
      console.warn(`Failed to delete media object: ${key}`, err)
    }
  }
}

export const uploadRoutes = new Hono<AppEnv>()

/** POST /upload - Carica file su BeechBucket */
uploadRoutes.post('/upload', async (c) => {
  try {
    const bucket = c.var.bucket
    const mediaRepo = c.var.mediaRepository
    const statsRepo = c.var.systemStatsRepository

    const contentType = c.req.header('Content-Type') ?? ''
    if (!contentType.includes('multipart/form-data')) {
      return c.json({ error: 'Content-Type must be multipart/form-data' }, 400)
    }

    const formData = await c.req.formData()
    const fileEntry = formData.get('file')

    if (!isFileLike(fileEntry)) {
      return c.json({ error: 'No file provided. Use field name "file"' }, 400)
    }
    const file = fileEntry

    const mimeOk = ALLOWED_MIME_PREFIXES.some((prefix) => file.type.startsWith(prefix))
    if (!mimeOk) {
      return c.json({ error: 'File type not allowed. Allowed: images and PDF' }, 400)
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return c.json({ error: 'File too large. Max 5MB' }, 400)
    }

    const objectKey = generateObjectKey(file.name)
    const body = await file.arrayBuffer()

    // 1. Upload allo storage
    await bucket.put(objectKey, body, { contentType: file.type })

    // 2. Aggiorna DB e Stats (in background se possibile)
    const uploadedBy = c.var.jwtPayload?.sub ?? ''
    const trackOperation = (async () => {
      try {
        await statsRepo.incrementStorage(file.size)
        await mediaRepo.trackUpload({
          key: objectKey,
          filename: file.name,
          mime_type: file.type,
          size_bytes: file.size,
          uploaded_by: uploadedBy
        })
      } catch (err) {
        console.error('Failed to update DB tracking for upload:', err)
      }
    })()

    try {
      c.executionCtx.waitUntil(trackOperation)
    } catch {
      await trackOperation
    }

    const publicUrl = bucket.getUrl(objectKey)

    const jwtPayload = c.get('jwtPayload')
    if (jwtPayload) {
      c.get('activityLogger').log({
        action: 'upload',
        entityType: 'media',
        entityId: objectKey,
        details: { name: file.name, size: file.size, type: file.type },
        actor: {
          id: jwtPayload.sub,
          email: jwtPayload.email ?? 'unknown',
          name: jwtPayload.name ?? null,
        },
      })
    }

    return c.json({ url: publicUrl }, 200)
  } catch (err) {
    console.error('Upload error:', err)
    return c.json({ error: 'Upload failed' }, 500)
  }
})

/** DELETE /upload/:key - Elimina un file */
uploadRoutes.delete('/upload/:key', async (c) => {
  const key = c.req.param('key')
  if (!key) return c.json({ error: 'Missing key' }, 400)
  
  await deleteR2Objects(c, [decodeURIComponent(key)])
  return c.json({ success: true }, 200)
})

/**
 * Serve un file dallo storage.
 */
export async function serveMediaHandler(c: any): Promise<Response> {
  const key = c.req.param('key')
  if (!key) return new Response('Missing key', { status: 400 })

  const bucket = c.var.bucket
  try {
    const object = await bucket.get(decodeURIComponent(key))
    if (!object) return new Response('Not found', { status: 404 })

    const headers = new Headers()
    headers.set('Content-Type', object.contentType ?? 'application/octet-stream')
    headers.set('Cache-Control', 'public, max-age=31536000, immutable')
    
    return new Response(object.body, { status: 200, headers })
  } catch (err) {
    return new Response('Internal error', { status: 500 })
  }
}
