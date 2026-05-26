// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

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
