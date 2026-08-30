// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Upload feature — presigned R2 uploads and media serving.
 * The Worker never receives file bytes: it acts as auth gatekeeper and signer only.
 */
import { Hono, type Context } from 'hono'
import { isMimeAccepted, SystemClock } from '@beechcms/core'
import { AppEnv } from '../../types'
import { deleteR2Objects } from '../../shared/storage/upload'

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
  const timestamp = SystemClock.nowSeconds()
  const randomSuffix = crypto.randomUUID().slice(0, 8)
  return `${timestamp}-${randomSuffix}-${sanitizeFilename(originalName)}`
}

function extractOriginalFilename(key: string): string {
  return key.replace(/^\d+(?:-[a-zA-Z0-9]+)?-/, '') || key
}

function safeDecodeKey(rawKey: string): string | null {
  try {
    return decodeURIComponent(rawKey)
  } catch {
    return null
  }
}

function sanitizeStorageKey(rawKey: string): string {
  let key = rawKey
  while (/\.\.[/\\]/.test(key)) {
    key = key.replace(/\.\.[/\\]/g, '')
  }
  while (key.includes('..')) {
    key = key.replace(/\.\./g, '')
  }
  key = key.replace(/^[/]+/, '')
  return key.replace(/[^a-zA-Z0-9._\-/]/g, '')
}

// MIME types that browsers can render as active content — must be served as
// attachments to prevent stored-XSS via same-origin script execution.
const FORCE_DOWNLOAD_MIME_PREFIXES = [
  'image/svg',
  'text/',
  'application/xml',
  'application/xhtml',
  'application/javascript',
  'application/x-javascript',
]

function isActiveMimeType(mime: string): boolean {
  const lower = mime.toLowerCase()
  return FORCE_DOWNLOAD_MIME_PREFIXES.some((prefix) => lower.startsWith(prefix))
}

export const uploadRoutes = new Hono<AppEnv>()

/** POST /upload — Direct proxied upload fallback (used when presigning is unconfigured). */
uploadRoutes.post('/upload', async (c) => {
  const { bucket, mediaRepository: mediaRepo, systemStatsRepository: statsRepo } = c.var

  let body: FormData
  try {
    body = await c.req.formData()
  } catch {
    return c.json({ error: 'Invalid multipart form data' }, 400)
  }

  const file = body.get('file')
  if (!file || typeof file === 'string') {
    return c.json({ error: 'file is required' }, 400)
  }

  const fileObj = file as File
  const filename = fileObj.name || 'upload'
  const mimeType = fileObj.type || 'application/octet-stream'
  const sizeBytes = fileObj.size

  if (!sizeBytes || sizeBytes <= 0) {
    return c.json({ error: 'File is empty' }, 400)
  }

  const maxBytes = resolveMaxUploadBytes(c.env)
  if (sizeBytes > maxBytes) {
    return c.json({ error: `File too large. Max ${maxBytes} bytes` }, 400)
  }

  if (!isMimeAccepted(mimeType, 'any')) {
    return c.json({ error: 'File type not allowed' }, 400)
  }

  const key = generateObjectKey(filename)

  await bucket.put(key, fileObj.stream(), {
    contentType: mimeType,
  })

  const uploadedBy = c.var.jwtPayload?.sub ?? ''
  const sanitizedFilename = extractOriginalFilename(key)

  await statsRepo.incrementStorage(sizeBytes)
  await mediaRepo.trackUpload({
    key,
    filename: sanitizedFilename,
    mime_type: mimeType,
    size_bytes: sizeBytes,
    uploaded_by: uploadedBy,
  })

  const jwtPayload = c.get('jwtPayload')
  if (jwtPayload) {
    c.get('activityLogger').log({
      action: 'upload',
      entityType: 'media',
      entityId: key,
      details: { name: sanitizedFilename, size: sizeBytes, type: mimeType },
      actor: {
        id: jwtPayload.sub,
        email: jwtPayload.email ?? 'unknown',
        name: [jwtPayload.name, jwtPayload.surname].filter(Boolean).join(' ') || null,
      },
    })
  }

  return c.json({ url: bucket.getUrl(key), key }, 200)
})

/** POST /upload/presign — Request a presigned URL for direct R2 upload. */
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

/** POST /upload/confirm — Verify R2 object and record metadata. Idempotent on key. */
uploadRoutes.post('/upload/confirm', async (c) => {
  const { bucket, mediaRepository: mediaRepo, systemStatsRepository: statsRepo } = c.var

  let body: { key?: unknown }
  try { body = await c.req.json() } catch { return c.json({ error: 'Invalid JSON body' }, 400) }
  const { key } = body
  if (typeof key !== 'string' || !key.trim()) return c.json({ error: 'key is required' }, 400)

  const decoded = safeDecodeKey(key)
  if (!decoded) {
    return c.json({ error: 'Invalid key format' }, 400)
  }

  // Sanitize and validate key format to prevent arbitrary file adoption/traversal
  const sanitizedKey = sanitizeStorageKey(decoded)
  if (!sanitizedKey || !/^\d+(?:-[a-zA-Z0-9]+)?-[a-zA-Z0-9._-]+$/.test(sanitizedKey)) {
    return c.json({ error: 'Invalid key format' }, 400)
  }

  const existing = await mediaRepo.getByKey(sanitizedKey)
  if (existing) return c.json({ url: bucket.getUrl(sanitizedKey) }, 200)

  const head = await bucket.head(sanitizedKey)
  if (!head) return c.json({ error: 'Object not found in storage' }, 404)

  const size = head.size ?? 0
  const maxBytes = resolveMaxUploadBytes(c.env)
  if (size > maxBytes) {
    return c.json({ error: `File too large. Max ${maxBytes} bytes` }, 400)
  }

  const mime = head.contentType ?? 'application/octet-stream'
  if (!isMimeAccepted(mime, 'any')) {
    return c.json({ error: 'File type not allowed' }, 400)
  }

  const uploadedBy = c.var.jwtPayload?.sub ?? ''
  const filename = extractOriginalFilename(sanitizedKey)

  await statsRepo.incrementStorage(size)
  await mediaRepo.trackUpload({
    key: sanitizedKey,
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
      entityId: sanitizedKey,
      details: { name: filename, size, type: mime },
      actor: {
        id: jwtPayload.sub,
        email: jwtPayload.email ?? 'unknown',
        name: [jwtPayload.name, jwtPayload.surname].filter(Boolean).join(' ') || null,
      },
    })
  }

  return c.json({ url: bucket.getUrl(sanitizedKey) }, 200)
})

/** GET /upload/download-url/:key — Presigned read URL for private assets. */
uploadRoutes.get('/upload/download-url/:key', async (c) => {
  const rawKey = c.req.param('key')
  if (!rawKey) return c.json({ error: 'Missing key' }, 400)

  const decoded = safeDecodeKey(rawKey)
  if (!decoded) return c.json({ error: 'Invalid key' }, 400)

  // Sanitize path parameter to prevent path traversal and restrict to standard storage characters
  const key = sanitizeStorageKey(decoded)
  if (!key) return c.json({ error: 'Invalid key' }, 400)

  // Retrieve the file metadata to check existence and ownership
  const media = await c.var.mediaRepository.getByKey(key).catch(() => null)
  if (!media) {
    return c.json({ error: 'Media not found' }, 404)
  }

  // Access Control: check owner (uploaded_by) or administrative role
  const jwtPayload = c.var.jwtPayload
  const userId = jwtPayload?.sub
  const isAdmin = jwtPayload?.role === 'admin'

  if (!isAdmin && userId !== media.uploaded_by) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const head = await c.var.bucket.head(key)
  if (!head) return c.json({ error: 'Object not found' }, 404)

  const downloadUrl = await c.var.bucket.presignGet(key, { expiresIn: PRESIGN_TTL_SECONDS })
  return c.json({ downloadUrl, expiresIn: PRESIGN_TTL_SECONDS }, 200)
})

/** DELETE /upload/:key */
uploadRoutes.delete('/upload/:key', async (c) => {
  const rawKey = c.req.param('key')
  if (!rawKey) return c.json({ error: 'Missing key' }, 400)

  const decoded = safeDecodeKey(rawKey)
  if (!decoded) return c.json({ error: 'Invalid key' }, 400)

  // Sanitize path parameter to prevent path traversal and restrict to standard storage characters
  const key = sanitizeStorageKey(decoded)
  if (!key) return c.json({ error: 'Invalid key' }, 400)

  // Retrieve the file metadata to check existence
  const media = await c.var.mediaRepository.getByKey(key).catch(() => null)
  if (!media) {
    return c.json({ error: 'Media not found' }, 404)
  }

  // Access Control: check owner (uploaded_by) or administrative role
  const jwtPayload = c.var.jwtPayload
  const userId = jwtPayload?.sub
  const isAdmin = jwtPayload?.role === 'admin'

  if (!isAdmin && userId !== media.uploaded_by) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  await deleteR2Objects(c, [key])
  return c.json({ success: true }, 200)
})

/** Serve a file from storage (used by the public /api/media/:key route). */
export async function serveMediaHandler(c: Context<AppEnv>): Promise<Response> {
  const rawKey = c.req.param('key')
  if (!rawKey) return new Response('Missing key', { status: 400 })

  const decoded = safeDecodeKey(rawKey)
  if (!decoded) return new Response('Invalid key', { status: 400 })

  const key = sanitizeStorageKey(decoded)
  if (!key) return new Response('Invalid key', { status: 400 })

  try {
    const object = await c.var.bucket.get(key)
    if (!object) return new Response('Not found', { status: 404 })
    const headers = new Headers()
    const originalMime = object.contentType ?? 'application/octet-stream'
    const filename = extractOriginalFilename(key)

    if (isActiveMimeType(originalMime)) {
      headers.set('Content-Type', 'application/octet-stream')
      headers.set('Content-Disposition', `attachment; filename="${filename}"`)
    } else {
      headers.set('Content-Type', originalMime)
    }

    headers.set('Content-Security-Policy', "default-src 'none'; sandbox")
    headers.set('X-Content-Type-Options', 'nosniff')
    headers.set('Cache-Control', 'public, max-age=31536000, immutable')
    return new Response(object.body, { status: 200, headers })
  } catch (err) {
    console.error(`[serveMediaHandler] Error serving file ${key}:`, err)
    return new Response('Internal error', { status: 500 })
  }
}
