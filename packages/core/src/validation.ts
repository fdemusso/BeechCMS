import { z } from 'zod'
import type { Branch, Seed } from './types'

export interface ValidationDetail {
  field: string
  expected: string
  received: string
  message: string
}

export interface ValidateSeedPayloadOptions {
  allowNull?: boolean
  rejectDangerousRichtext?: boolean
  maxTextLength?: number
}

export interface ValidateSeedPayloadResult {
  data: Record<string, unknown>
  details: ValidationDetail[]
  unknownAliases: string[]
  dangerousFields: string[]
}

const DEFAULT_MAX_TEXT_LENGTH = 50000
const CONTROL_CHARS_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
const DANGEROUS_TAG_REGEX = /<(script|iframe|object|embed)\b/i
const DANGEROUS_ATTR_REGEX = /\son[a-z]+\s*=/i

const statusSchema = z.enum(['draft', 'review', 'published'])
const finiteNumberSchema = z.number().refine(Number.isFinite, 'Expected finite number')
const stringSchema = z.string()
const booleanSchema = z.boolean()

function sanitizePlainString(value: string): string {
  return value.replaceAll(CONTROL_CHARS_REGEX, '').trim()
}

function sanitizeRichtext(value: string): { value: string; dangerous: boolean } {
  const noControl = value.replaceAll(CONTROL_CHARS_REGEX, '')
  const dangerous = DANGEROUS_TAG_REGEX.test(noControl) || DANGEROUS_ATTR_REGEX.test(noControl)

  // Best-effort sanitization for Sprint 02; complete policy tracked in TODOs below.
  const strippedTags = noControl.replaceAll(/<\/?(script|iframe|object|embed)[^>]*>/gi, '')
  const strippedHandlers = strippedTags.replaceAll(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '')
  return { value: strippedHandlers.trim(), dangerous }
}

function makeDetail(field: string, expected: string, received: unknown): ValidationDetail {
  let receivedType: string = typeof received
  if (received === null) receivedType = 'null'
  else if (Array.isArray(received)) receivedType = 'array'
  return {
    field,
    expected,
    received: receivedType,
    message: `Field '${field}' expects type '${expected}' but received '${receivedType}'`,
  }
}

function isIsoDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return false
  return !Number.isNaN(Date.parse(value))
}

function validateBranchValue(
  branch: Branch,
  alias: string,
  rawValue: unknown,
  options: Required<ValidateSeedPayloadOptions>
): { ok: true; value: unknown; dangerous?: boolean } | { ok: false; detail: ValidationDetail } {
  if (rawValue === null) {
    return options.allowNull
      ? { ok: true, value: null }
      : { ok: false, detail: makeDetail(alias, branch.type, rawValue) }
  }

  switch (branch.type) {
    case 'text': {
      if (!stringSchema.safeParse(rawValue).success) {
        return { ok: false, detail: makeDetail(alias, 'string', rawValue) }
      }
      const sanitized = sanitizePlainString(rawValue as string)
      if (sanitized.length > options.maxTextLength) {
        return { ok: false, detail: makeDetail(alias, `string(max:${options.maxTextLength})`, rawValue) }
      }
      return { ok: true, value: sanitized }
    }

    case 'richtext': {
      if (!stringSchema.safeParse(rawValue).success) {
        return { ok: false, detail: makeDetail(alias, 'string', rawValue) }
      }
      const sanitized = sanitizeRichtext(rawValue as string)
      if (sanitized.value.length > options.maxTextLength) {
        return { ok: false, detail: makeDetail(alias, `string(max:${options.maxTextLength})`, rawValue) }
      }
      return { ok: true, value: sanitized.value, dangerous: sanitized.dangerous }
    }

    case 'number': {
      if (!finiteNumberSchema.safeParse(rawValue).success) {
        return { ok: false, detail: makeDetail(alias, 'number', rawValue) }
      }
      return { ok: true, value: rawValue }
    }

    case 'boolean': {
      if (!booleanSchema.safeParse(rawValue).success) {
        return { ok: false, detail: makeDetail(alias, 'boolean', rawValue) }
      }
      return { ok: true, value: rawValue }
    }

    case 'date': {
      if (!stringSchema.safeParse(rawValue).success) {
        return { ok: false, detail: makeDetail(alias, 'date(ISO)', rawValue) }
      }
      const value = sanitizePlainString(rawValue as string)
      if (!isIsoDateString(value)) {
        return { ok: false, detail: makeDetail(alias, 'date(ISO)', rawValue) }
      }
      return { ok: true, value }
    }

    case 'json': {
      const isValidJsonLike =
        (typeof rawValue === 'object' && rawValue !== null) || Array.isArray(rawValue)
      if (!isValidJsonLike || typeof rawValue === 'string') {
        return { ok: false, detail: makeDetail(alias, 'object|array', rawValue) }
      }
      return { ok: true, value: rawValue }
    }

    case 'file': {
      if (!stringSchema.safeParse(rawValue).success) {
        return { ok: false, detail: makeDetail(alias, 'url-string', rawValue) }
      }
      const urlValue = sanitizePlainString(rawValue as string)
      try {
        const parsed = new URL(urlValue)
        if (!parsed.protocol.startsWith('http')) {
          return { ok: false, detail: makeDetail(alias, 'url-string', rawValue) }
        }
      } catch {
        return { ok: false, detail: makeDetail(alias, 'url-string', rawValue) }
      }
      return { ok: true, value: urlValue }
    }
  }
}

/**
 * Foundation comune per validazione e sanitizzazione payload schema-driven.
 * Usata da Public API e riusabile nel Botanical Engine.
 */
export function validateAndSanitizeSeedPayload(
  seed: Seed,
  payload: Record<string, unknown>,
  options: ValidateSeedPayloadOptions = {}
): ValidateSeedPayloadResult {
  const normalizedOptions: Required<ValidateSeedPayloadOptions> = {
    allowNull: options.allowNull ?? false,
    rejectDangerousRichtext: options.rejectDangerousRichtext ?? true,
    maxTextLength: options.maxTextLength ?? DEFAULT_MAX_TEXT_LENGTH,
  }

  const details: ValidationDetail[] = []
  const data: Record<string, unknown> = {}
  const unknownAliases: string[] = []
  const dangerousFields: string[] = []
  const branchByAlias = new Map(seed.branches.map((branch) => [branch.alias, branch]))

  for (const [alias, rawValue] of Object.entries(payload)) {
    const branch = branchByAlias.get(alias)
    if (!branch) {
      unknownAliases.push(alias)
      continue
    }

    const result = validateBranchValue(branch, alias, rawValue, normalizedOptions)
    if (!result.ok) {
      details.push(result.detail)
      continue
    }

    if (branch.type === 'richtext' && result.dangerous) {
      dangerousFields.push(alias)
      if (normalizedOptions.rejectDangerousRichtext) {
        continue
      }
    }

    data[alias] = result.value
  }

  return { data, details, unknownAliases, dangerousFields }
}

/**
 * Valida status content supportati dal CMS.
 */
export function isValidContentStatus(value: unknown): value is 'draft' | 'review' | 'published' {
  return statusSchema.safeParse(value).success
}

/**
 * FUTURE(core-zod-complete): introdurre schema Zod completo per payload create/update.
 * FUTURE(core-zod-complete): modellare required fields per seed/branch nello schema.
 * FUTURE(core-zod-complete): aggiungere warning/telemetria strutturata per alias sconosciuti.
 * FUTURE(core-zod-complete): aggiungere regole avanzate per branch (vincoli composti, enum dinamici).
 * FUTURE(core-zod-complete): differenziare regole create vs update a livello schema.
 */

