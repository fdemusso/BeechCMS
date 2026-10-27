// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Upload feature — presigned R2 uploads and media serving.
 * The Worker never receives file bytes: it acts as auth gatekeeper and signer only.
 */
import { Hono, type Context } from 'hono'
import type { z } from 'zod'
import { isMimeAccepted, parseMediaTransformQuery, SystemClock, type BeechBucket } from '@beechcms/core'
import { AppEnv } from '../../types'
import { deleteR2Objects } from '../../shared/storage/upload'
import { importObjectKeyPrefix } from '../../shared/storage/import-object-key'
import { zodJson, type ZodJsonRefusal } from '../../shared/utils/zod-json'
import { mediaTransformError, serveTransformedMedia } from './media-transform'
import { refuseProxiedUploadInProduction, requireUploadFile } from './upload.middleware'
import { confirmRequestSchema, firstIssueMessage, presignRequestSchema } from './upload.schema'

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

/**
 * Drops an object that failed confirmation. It has no media row, so `deleteR2Objects` cannot be
 * used; without this the bytes stay in the bucket and remain servable at /api/media/<key>.
 */
async function discardRejectedUpload(bucket: BeechBucket, key: string): Promise<void> {
  try {
    await bucket.delete(key)
  } catch (err) {
    console.error(`[upload/confirm] failed to delete rejected object ${key}:`, err)
  }
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

/** A body that is not JSON and a body that breaks a rule are both 400; only the message differs. */
function rejectInvalidBody(context: Context<AppEnv>, error: z.ZodError, cause: ZodJsonRefusal) {
  return context.json({ error: cause === 'malformed' ? 'Invalid JSON body' : firstIssueMessage(error) }, 400)
}

/**
 * Registered as one method chain so the route types reach `AppType` (see `../../routes.ts`).
 */
export const uploadRoutes = new Hono<AppEnv>()

  /**
   * POST /upload — Dev-only proxied upload fallback (used when presigning is unconfigured).
   * Refused in production before the body is read: the Worker must never parse upload bytes there.
   */
  .post('/upload', refuseProxiedUploadInProduction, requireUploadFile, async (c) => {
    const { bucket, mediaRepository: mediaRepo } = c.var

    const fileObj = c.req.valid('form').file
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

    await mediaRepo.registerUpload({
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
  .post('/upload/presign', zodJson(presignRequestSchema, rejectInvalidBody), async (c) => {
    const { filename, mimeType, sizeBytes, purpose } = c.req.valid('json')

    const maxBytes = resolveMaxUploadBytes(c.env)
    if (sizeBytes > maxBytes) return c.json({ error: `File too large. Max ${maxBytes} bytes` }, 400)
    if (!isMimeAccepted(mimeType, 'any')) return c.json({ error: 'File type not allowed' }, 400)

    const generated = generateObjectKey(filename)
    const key = purpose === 'import' ? `${importObjectKeyPrefix(c.var.jwtPayload?.sub ?? '')}${generated}` : generated
    const uploadUrl = await c.var.bucket.presignPut(key, {
      expiresIn: PRESIGN_TTL_SECONDS,
      contentType: mimeType,
      contentLength: sizeBytes,
    })

    return c.json({ uploadUrl, key, expiresIn: PRESIGN_TTL_SECONDS }, 200)
  })

  /** POST /upload/confirm — Verify R2 object and record metadata. Idempotent on key. */
  .post('/upload/confirm', zodJson(confirmRequestSchema, rejectInvalidBody), async (c) => {
    const { bucket, mediaRepository: mediaRepo } = c.var
    const { key } = c.req.valid('json')

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
      await discardRejectedUpload(bucket, sanitizedKey)
      return c.json({ error: `File too large. Max ${maxBytes} bytes` }, 400)
    }

    const mime = head.contentType ?? 'application/octet-stream'
    if (!isMimeAccepted(mime, 'any')) {
      await discardRejectedUpload(bucket, sanitizedKey)
      return c.json({ error: 'File type not allowed' }, 400)
    }

    const uploadedBy = c.var.jwtPayload?.sub ?? ''
    const filename = extractOriginalFilename(sanitizedKey)

    // A racing confirmation that lost the insert has nothing left to do; the winner logs the upload.
    const registered = await mediaRepo.registerUpload({
      key: sanitizedKey,
      filename,
      mime_type: mime,
      size_bytes: size,
      uploaded_by: uploadedBy,
    })
    if (!registered) return c.json({ url: bucket.getUrl(sanitizedKey) }, 200)

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
  .get('/upload/download-url/:key', async (c) => {
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
  .delete('/upload/:key', async (c) => {
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

  // Decided before any storage I/O: an invalid transform request must not cost an R2 read.
  const transformQuery = parseMediaTransformQuery(new URL(c.req.url).searchParams)
  if (transformQuery.kind === 'invalid') return mediaTransformError(c, 400, transformQuery.code)

  try {
    // The registry is the allowlist: a bucket object with no row (never confirmed, or rejected at
    // confirm) is not public. Checked before any R2 read and before the edge-cache branch of transforms.
    if (!(await c.var.mediaRepository.getByKey(key))) return new Response('Not found', { status: 404 })

    if (transformQuery.kind === 'transform') return await serveTransformedMedia(c, key, transformQuery.request)

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
