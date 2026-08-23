// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { resolveClassification, SlugConflictError, verifyMagicBytes, verifyTimeTrapToken, sha256hex, SystemClock } from '@beechcms/core'
import type { Seed } from '@beechcms/core'
import type { Context } from 'hono'
import { cleanStr } from '../shared/utils/query-utils.js'
import { checkPublicOperation } from './access-policy.js'
import { publicProblem, internalErrorDetail } from './problem-details.js'
import { generateEntrySlug, slugify } from './slug-utils.js'
import { sanitizePublicPayload } from './sanitize.js'
import { parseIdempotencyKey, buildRequestFingerprint } from './idempotency.js'
import { applyPrivacy, PrivacyPolicyError } from '../shared/policies/apply-policies.js'
import type { AppEnv } from '../types.js'

interface ParsedAttachment {
  filename: string
  declaredMime: string
  buffer: Uint8Array
  fileKey?: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function pickSlug(body: Record<string, unknown>, sanitizedData: Record<string, unknown>): string {
  const explicit = Object.hasOwn(body, 'slug') ? cleanStr(body.slug) : ''
  if (explicit) return slugify(explicit)
  return generateEntrySlug({
    title: Object.hasOwn(sanitizedData, 'title') ? sanitizedData.title : undefined,
    name: Object.hasOwn(sanitizedData, 'name') ? sanitizedData.name : undefined,
  })
}

function parseBase64Data(raw: string): { mime?: string; bytes: Uint8Array } | null {
  try {
    let base64Part = raw
    let detectedMime: string | undefined
    if (raw.startsWith('data:')) {
      const commaIdx = raw.indexOf(',')
      if (commaIdx !== -1) {
        const meta = raw.slice(5, commaIdx)
        detectedMime = meta.split(';')[0]
        base64Part = raw.slice(commaIdx + 1)
      }
    }
    const binary = atob(base64Part.trim())
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return { mime: detectedMime, bytes }
  } catch {
    return null
  }
}

function extractAttachments(body: Record<string, unknown>, rawData: Record<string, unknown> | null, seed: Seed): ParsedAttachment[] {
  const attachments: ParsedAttachment[] = []

  if (Array.isArray(body.attachments)) {
    for (const item of body.attachments) {
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>
        const rawContent = (obj.data || obj.content || obj.base64) as string | undefined
        const filename = String(obj.filename || obj.name || 'attachment')
        const declaredMime = String(obj.mimeType || obj.type || obj.contentType || 'application/octet-stream')
        const fileKey = typeof obj.fileKey === 'string' ? obj.fileKey : (typeof obj.key === 'string' ? obj.key : undefined)
        if (typeof rawContent === 'string') {
          const parsed = parseBase64Data(rawContent)
          if (parsed) {
            attachments.push({
              filename,
              declaredMime: obj.mimeType || obj.type || obj.contentType ? declaredMime : (parsed.mime || declaredMime),
              buffer: parsed.bytes,
              fileKey,
            })
          }
        }
      }
    }
  }

  if (rawData) {
    for (const branch of seed.branches) {
      if (branch.type === 'file' && Object.hasOwn(rawData, branch.alias)) {
        const val = rawData[branch.alias]
        const items = Array.isArray(val) ? val : [val]
        for (const item of items) {
          if (typeof item === 'string') {
            if (item.startsWith('data:')) {
              const parsed = parseBase64Data(item)
              if (parsed) {
                attachments.push({
                  filename: `${branch.alias}-attachment`,
                  declaredMime: parsed.mime || 'application/octet-stream',
                  buffer: parsed.bytes,
                })
              }
            }
          } else if (item && typeof item === 'object') {
            const obj = item as Record<string, unknown>
            const rawContent = (obj.data || obj.content || obj.base64) as string | undefined
            const filename = String(obj.filename || obj.name || `${branch.alias}-attachment`)
            const declaredMime = String(obj.mimeType || obj.type || obj.contentType || 'application/octet-stream')
            const fileKey = typeof obj.fileKey === 'string' ? obj.fileKey : (typeof obj.key === 'string' ? obj.key : undefined)
            if (typeof rawContent === 'string') {
              const parsed = parseBase64Data(rawContent)
              if (parsed) {
                attachments.push({
                  filename,
                  declaredMime: obj.mimeType || obj.type || obj.contentType ? declaredMime : (parsed.mime || declaredMime),
                  buffer: parsed.bytes,
                  fileKey,
                })
              }
            }
          }
        }
      }
    }
  }

  return attachments
}

const DECOY_FIELDS = ['fax_number', 'website_url', 'middle_name', 'secondary_phone', '_gotcha', 'honeypot']

export async function publicAddHandler(context: Context<AppEnv>) {
  const seedSlug = context.req.param('seed') ?? ''
  const seed = context.get('getSeed')(seedSlug)
  if (!seed) {
    return publicProblem(context, { type: 'seed-not-found', title: 'Seed Not Found', status: 404, detail: `The content type '${seedSlug}' does not exist.` })
  }

  const access = checkPublicOperation(seed, 'add')
  if (!access.ok) {
    return publicProblem(context, { type: 'operation-not-allowed', title: access.error.error, status: 403, detail: access.error.message })
  }

  const allowedOrigins = context.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean)
  const origin = context.req.header('Origin') || context.req.header('Referer')
  if (allowedOrigins && allowedOrigins.length > 0 && origin) {
    let originHost = origin
    try {
      originHost = new URL(origin).origin
    } catch {
      // Keep raw origin string if URL parsing fails
    }
    if (!allowedOrigins.includes(originHost)) {
      return publicProblem(context, {
        type: 'forbidden-origin',
        title: 'Forbidden',
        status: 403,
        detail: `Requests from origin '${originHost}' are not allowed.`,
      })
    }
  }

  let body: Record<string, unknown>
  try {
    const parsed = await context.req.json<unknown>()
    body = asRecord(parsed) ?? {}
  } catch {
    return publicProblem(context, { type: 'invalid-json-body', title: 'Bad Request', status: 400, detail: 'Invalid JSON body' })
  }

  const rawData = asRecord(body.data)

  // Camouflage Honeypot check
  for (const decoy of DECOY_FIELDS) {
    const inBody = body[decoy]
    const inRaw = rawData && rawData[decoy]
    const val = inBody !== undefined ? inBody : inRaw
    if (val !== undefined && val !== null && val !== '') {
      context.get('activityLogger').log({
        action: 'security_alert',
        entityType: 'content',
        entityId: 'honeypot_trap',
        details: { decoy, ip: context.req.header('cf-connecting-ip') || 'unknown' },
        actor: { id: 'public', email: 'bot@honeypot.local', name: 'Bot Trap' },
      })
      return publicProblem(context, {
        type: 'honeypot-triggered',
        title: 'Unprocessable Entity',
        status: 422,
        detail: 'Bot submission detected.',
      })
    }
  }

  // Time Trap verification (Mandatory for public submissions)
  const timeTrapToken = (typeof body._timeTrapToken === 'string' ? body._timeTrapToken : null) || context.req.header('x-time-trap')
  if (!timeTrapToken) {
    return publicProblem(context, {
      type: 'time-trap-missing',
      title: 'Unprocessable Entity',
      status: 422,
      detail: 'Time-Trap token is required for public form submissions',
    })
  }

  const tokenHash = await sha256hex(timeTrapToken)
  const timeTrapTokenRepo = context.get('timeTrapTokenRepository')
  if (timeTrapTokenRepo) {
    const isUsed = await timeTrapTokenRepo.isTokenUsed(tokenHash)
    if (isUsed) {
      return publicProblem(context, {
        type: 'time-trap-replayed',
        title: 'Unprocessable Entity',
        status: 422,
        detail: 'Time-Trap token has already been used',
      })
    }
  }

  const secret = context.env.PUBLIC_TIME_TRAP_SECRET || 'beech-public-timetrap-default-secret'
  const verification = await verifyTimeTrapToken(timeTrapToken, secret, 1.5, 3600)
  if (!verification.valid) {
    return publicProblem(context, {
      type: 'time-trap-violation',
      title: 'Unprocessable Entity',
      status: 422,
      detail: verification.reason || 'Invalid submission timing.',
    })
  }

  if (!rawData || Object.keys(rawData).length === 0) {
    return publicProblem(context, { type: 'invalid-data-object', title: 'Bad Request', status: 400, detail: "Field 'data' is required and must be a non-empty object" })
  }

  // Backend-Driven Status Management (disregard client status, enforce backend default)
  const statusValue = ((seed as any).defaultPublicStatus as string) || 'published'

  // Reject internal and restricted fields on public add
  const disallowedAliases = Object.keys(rawData).filter((alias) => {
    const branch = seed.branches.find((b) => b.alias === alias)
    if (!branch) return false
    // Explicit public: false takes absolute precedence
    if (branch.policies?.public === false) return true
    // If explicitly marked public: true, allow write
    if (branch.policies?.public === true) return false
    // internal and restricted fields can never be written publicly
    const classification = resolveClassification(branch).classification
    return classification === 'internal' || classification === 'restricted'
  })
  if (disallowedAliases.length > 0) {
    return publicProblem(context, {
      type: 'sensitive-field-write',
      title: 'Unprocessable Entity',
      status: 422,
      detail: `Cannot write internal/restricted fields: ${disallowedAliases.join(', ')}`,
    })
  }

  // Magic Bytes file attachment verification
  const attachments = extractAttachments(body, rawData, seed)
  for (const att of attachments) {
    const result = verifyMagicBytes(att.buffer, att.declaredMime)
    if (!result.valid) {
      return publicProblem(context, {
        type: 'invalid-file-signature',
        title: 'Bad Request',
        status: 400,
        detail: result.error || `Invalid file signature for '${att.filename}'.`,
      })
    }
  }

  const sanitized = sanitizePublicPayload(seed, rawData, { operation: 'create', allowNull: false, requireAtLeastOneValidField: true, enforceRequiredFields: true })
  if (!sanitized.ok) {
    if (sanitized.status === 422) {
      return publicProblem(context, { type: sanitized.code, title: 'Unprocessable Entity', status: 422, detail: sanitized.message })
    }
    return publicProblem(context, { type: sanitized.code, title: 'Bad Request', status: 400, detail: sanitized.message, errors: sanitized.details })
  }

  let privacyData: Record<string, unknown>
  try {
    privacyData = await applyPrivacy(sanitized.data, seed)
  } catch (error) {
    if (error instanceof PrivacyPolicyError) {
      return publicProblem(context, { type: 'policy-not-implemented', title: 'Not Implemented', status: 501, detail: error.message })
    }
    throw error
  }

  const idempotencyKey = parseIdempotencyKey(context.req.header('Idempotency-Key'))
  const finalSlug = pickSlug(body, privacyData) || context.get('idGenerator').uuid().slice(0, 8)
  const repository = context.get('repository')
  const idempotencyRepository = context.get('idempotencyRepository')

  try {
    const clock = context.get('clock') ?? SystemClock
    const now = clock.nowSeconds()
    const fingerprint = await buildRequestFingerprint({
      seedSlug,
      statusValue,
      slug: Object.hasOwn(body, 'slug') ? cleanStr(body.slug) : null,
      data: sanitized.data,
    })
    const idempotencyTtl = Math.max(60, Number.parseInt(context.env.PUBLIC_IDEMPOTENCY_TTL_SECONDS ?? '86400', 10) || 86400)

    if (idempotencyKey) {
      const existing = await idempotencyRepository.lookup(idempotencyKey)
      if (existing && existing.expiresAt >= now) {
        if (existing.fingerprint !== fingerprint) {
          return publicProblem(context, { type: 'idempotency-key-conflict', title: 'Conflict', status: 409, detail: 'Idempotency-Key was already used with a different request payload.' })
        }
        let parsedBody: unknown = null
        try { parsedBody = JSON.parse(existing.responseBody) } catch { parsedBody = { success: true } }
        return context.json(parsedBody, existing.responseStatus as 201)
      }
    }

    const id = context.get('idGenerator').uuid()

    try {
      await repository.create(seed, id, finalSlug, statusValue as any, privacyData)
    } catch (error) {
      if (error instanceof SlugConflictError) {
        return publicProblem(context, { type: 'slug-conflict', title: 'Conflict', status: 409, detail: `An entry with slug '${finalSlug}' already exists for content type '${seedSlug}'.` })
      }
      throw error
    }

    // Mark single-use Time-Trap token as consumed
    if (timeTrapTokenRepo) {
      let t0 = now
      const parts = timeTrapToken.split('.')
      if (parts[0]?.startsWith('t0_')) {
        const parsedT0 = Number.parseInt(parts[0].slice(3), 10)
        if (Number.isFinite(parsedT0)) {
          t0 = parsedT0
        }
      }
      await timeTrapTokenRepo.markTokenUsed(tokenHash, now, t0 + 3600)
    }

    const responseBody = { success: true, id, slug: finalSlug }
    if (idempotencyKey) {
      await idempotencyRepository.store({ key: idempotencyKey, fingerprint, responseStatus: 201, responseBody: JSON.stringify(responseBody), expiresAt: now + idempotencyTtl })
    }

    const safeTitle = Object.hasOwn(privacyData, 'title') ? privacyData.title : undefined
    const safeName = Object.hasOwn(privacyData, 'name') ? privacyData.name : undefined
    context.get('notificationService').notify({
      title: `${seed.label}: New entry`,
      message: `A new entry ("${safeTitle || safeName || finalSlug}") has been added via the public API.`,
      type: 'success',
    })

    const title = String(safeTitle || safeName || finalSlug)

    context.get('activityLogger').log({
      action: 'create',
      entityType: 'content',
      entityId: id,
      entitySlug: finalSlug,
      details: { title },
      actor: { id: 'public', email: 'public-api@beechcms.local', name: 'Public API' },
    })

    // Async Quarantine Antivirus Scan
    if (attachments.length > 0) {
      const av = context.get('antivirusProvider')
      if (av) {
        for (const att of attachments) {
          context.get('scheduler').waitUntil((async () => {
            try {
              const scanResult = await av.scan(att.buffer, att.filename)
              if (scanResult.status === 'infected') {
                if (att.fileKey && context.get('bucket')) {
                  await context.get('bucket').delete(att.fileKey).catch(() => {})
                }
                context.get('notificationService').notify({
                  title: 'Security Alert: Infected file detected',
                  message: `Attachment '${att.filename}' submitted to seed '${seedSlug}' was infected (${scanResult.details || scanResult.threatName || 'malware detected'}) and deleted.`,
                  type: 'error',
                })
              }
            } catch (err) {
              console.error(`Antivirus scan failed for attachment ${att.filename}:`, err)
            }
          })())
        }
      }
    }

    context.get('scheduler').waitUntil(
      context.get('automationRunner').run({
        seedSlug,
        event: 'create',
        entry: { id, slug: finalSlug, status: statusValue, ...sanitized.data },
      })
    )

    return context.json(responseBody, 201)
  } catch (error) {
    console.error('Public add error:', error)
    return publicProblem(context, { type: 'internal-server-error', title: 'Internal Server Error', status: 500, detail: internalErrorDetail(context.env, error) })
  }
}
