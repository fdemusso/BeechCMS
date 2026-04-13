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
  operation?: 'create' | 'update'
  unknownAliases?: 'collect' | 'reject'
  requireAtLeastOneValidField?: boolean
  enforceRequiredFields?: boolean
}

export interface ValidateSeedPayloadResult {
  data: Record<string, unknown>
  details: ValidationDetail[]
  unknownAliases: string[]
  dangerousFields: string[]
  requiredFieldsMissing: string[]
  hasAnyValidField: boolean
}

const DEFAULT_MAX_TEXT_LENGTH = 50000
const CONTROL_CHARS_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
const DANGEROUS_TAG_REGEX = /<(script|iframe|object|embed)\b/i
const DANGEROUS_ATTR_REGEX = /\son[a-z]+\s*=/i

const statusSchema = z.enum(['draft', 'review', 'published'])
const finiteNumberSchema = z.number().refine(Number.isFinite, 'Expected finite number')
const stringSchema = z.string()
const booleanSchema = z.boolean()

function isAssetListBranch(branch: Branch): boolean {
  return branch.type === 'file' && (branch.multiple === true || branch.format === 'asset-list')
}

function normalizeHttpUrl(value: unknown): string | null {
  if (!stringSchema.safeParse(value).success) {
    return null
  }
  const cleaned = sanitizePlainString(value as string)
  if (!cleaned) {
    return null
  }
  try {
    const parsed = new URL(cleaned)
    if (!parsed.protocol.startsWith('http')) {
      return null
    }
  } catch {
    return null
  }
  return cleaned
}

function parseJsonString(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function normalizeAssetListValue(rawValue: unknown): string[] | null {
  const input = typeof rawValue === 'string' ? parseJsonString(rawValue) : rawValue
  const values = Array.isArray(input) ? input : [input]
  const normalized: string[] = []

  for (const item of values) {
    if (item == null) continue
    const directUrl = normalizeHttpUrl(item)
    if (directUrl) {
      normalized.push(directUrl)
      continue
    }
    if (typeof item === 'object' && !Array.isArray(item)) {
      const nestedUrl = normalizeHttpUrl((item as Record<string, unknown>).url)
      if (nestedUrl) {
        normalized.push(nestedUrl)
        continue
      }
    }
    return null
  }

  return [...new Set(normalized)]
}

function sanitizePlainString(value: string): string {
  return value.replaceAll(CONTROL_CHARS_REGEX, '').trim()
}

function isMissingRequiredValue(value: unknown): boolean {
  if (value == null) return true
  if (typeof value === 'string') return sanitizePlainString(value).length === 0
  if (Array.isArray(value)) return value.length === 0
  return false
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
      if (isAssetListBranch(branch)) {
        const listValue = normalizeAssetListValue(rawValue)
        if (!listValue) {
          return { ok: false, detail: makeDetail(alias, 'url-string[]', rawValue) }
        }
        return { ok: true, value: listValue }
      }
      const singleUrl = normalizeHttpUrl(rawValue)
      if (!singleUrl) {
        return { ok: false, detail: makeDetail(alias, 'url-string', rawValue) }
      }
      return { ok: true, value: singleUrl }
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
    operation: options.operation ?? 'create',
    unknownAliases: options.unknownAliases ?? 'collect',
    requireAtLeastOneValidField: options.requireAtLeastOneValidField ?? false,
    enforceRequiredFields: options.enforceRequiredFields ?? false,
  }

  const details: ValidationDetail[] = []
  const data: Record<string, unknown> = {}
  const unknownAliases: string[] = []
  const dangerousFields: string[] = []
  const requiredFieldsMissing: string[] = []
  const branchByAlias = new Map(seed.branches.map((branch) => [branch.alias, branch]))
  const providedKnownAliases = new Set<string>()

  for (const [alias, rawValue] of Object.entries(payload)) {
    const branch = branchByAlias.get(alias)
    if (!branch) {
      unknownAliases.push(alias)
      if (normalizedOptions.unknownAliases === 'reject') {
        details.push({
          field: alias,
          expected: 'known-seed-alias',
          received: 'unknown-alias',
          message: `Field '${alias}' is not defined in seed '${seed.slug}'`,
        })
      }
      continue
    }
    providedKnownAliases.add(alias)

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

  if (normalizedOptions.enforceRequiredFields) {
    for (const branch of seed.branches) {
      const isRequired =
        normalizedOptions.operation === 'create' ? branch.requiredOnCreate : branch.requiredOnUpdate
      if (!isRequired) continue

      const hasProvidedAlias = providedKnownAliases.has(branch.alias)
      if (!hasProvidedAlias) {
        requiredFieldsMissing.push(branch.alias)
        details.push({
          field: branch.alias,
          expected: 'required-field',
          received: 'missing',
          message: `Field '${branch.alias}' is required for ${normalizedOptions.operation}`,
        })
        continue
      }

      if (isMissingRequiredValue(data[branch.alias])) {
        requiredFieldsMissing.push(branch.alias)
        details.push({
          field: branch.alias,
          expected: 'required-field',
          received: 'empty',
          message: `Field '${branch.alias}' cannot be empty for ${normalizedOptions.operation}`,
        })
      }
    }
  }

  if (normalizedOptions.requireAtLeastOneValidField && Object.keys(data).length === 0) {
    details.push({
      field: 'data',
      expected: 'at-least-one-valid-field',
      received: 'empty',
      message: 'Payload does not contain any valid fields for this operation',
    })
  }

  return {
    data,
    details,
    unknownAliases,
    dangerousFields,
    requiredFieldsMissing,
    hasAnyValidField: Object.keys(data).length > 0,
  }
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

