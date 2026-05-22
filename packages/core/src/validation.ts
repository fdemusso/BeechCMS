import { z } from 'zod'
import type { Branch, Seed } from './types.js'
import { RICHTEXT_SCHEMA_VERSION, isRichtextEnvelopeV1 } from './richtext.js'

export interface ValidationDetail {
  field: string
  expected: string
  received: string
  message: string
}

export interface ValidateSeedPayloadOptions {
  allowNull?: boolean
  operation?: 'create' | 'update'
  requireAtLeastOneValidField?: boolean
  enforceRequiredFields?: boolean
  maxTextLength?: number
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
const DANGEROUS_PROTOCOL_REGEX = /^\s*javascript:/i
const DANGEROUS_RICHTEXT_NODE_TYPES = new Set(['script', 'iframe', 'object', 'embed'])
const LINK_LIKE_RICHTEXT_ATTRS = new Set(['href', 'src'])

const statusSchema = z.enum(['draft', 'review', 'published'])
const finiteNumberSchema = z.number().refine(Number.isFinite, 'Expected finite number')
const stringSchema = z.string()
const booleanSchema = z.boolean()
const jsonObjectOrArraySchema = z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())])

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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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

function collectRichtextVisibleText(value: unknown, chunks: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectRichtextVisibleText(item, chunks)
    return
  }
  if (!isPlainObject(value)) return

  if (typeof value.text === 'string') {
    chunks.push(sanitizePlainString(value.text))
  }
  const attrs = typeof value.attrs === 'object' && value.attrs !== null ? (value.attrs as Record<string, unknown>) : null
  if (attrs && typeof attrs.latex === 'string') {
    chunks.push(sanitizePlainString(attrs.latex))
  }
  if (Array.isArray(value.content)) {
    for (const nested of value.content) collectRichtextVisibleText(nested, chunks)
  }
}

function isRichtextDocEmpty(value: unknown): boolean {
  if (!isPlainObject(value)) return false
  if (isRichtextEnvelopeV1(value)) {
    return isRichtextDocEmpty(value.doc)
  }
  if (value.type !== 'doc') return false
  const chunks: string[] = []
  collectRichtextVisibleText(value, chunks)
  return chunks.join('').trim().length === 0
}

function isMissingRequiredValue(value: unknown): boolean {
  if (value == null) return true
  if (typeof value === 'string') return sanitizePlainString(value).length === 0
  if (Array.isArray(value)) return value.length === 0
  if (isPlainObject(value)) {
    if (isRichtextEnvelopeV1(value)) {
      return isRichtextDocEmpty(value.doc)
    }
    if (isRichtextDocEmpty(value)) return true
    return Object.keys(value).length === 0
  }
  return false
}

function sanitizeRichtextString(value: string): {
  value: string
  dangerous: boolean
  size: number
} {
  const noControl = value.replaceAll(CONTROL_CHARS_REGEX, '')
  const dangerous = DANGEROUS_TAG_REGEX.test(noControl) || DANGEROUS_ATTR_REGEX.test(noControl)

  // Best-effort sanitization for Sprint 02; complete policy tracked in TODOs below.
  const strippedTags = noControl.replaceAll(/<\/?(script|iframe|object|embed)[^>]*>/gi, '')
  const strippedHandlers = strippedTags.replaceAll(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '')
  const nextValue = strippedHandlers.trim()
  return { value: nextValue, dangerous, size: nextValue.length }
}

function sanitizeRichtextJsonNode(value: unknown, state: { dangerous: boolean }): unknown {
  if (typeof value === 'string') {
    const cleaned = value.replaceAll(CONTROL_CHARS_REGEX, '')
    if (DANGEROUS_TAG_REGEX.test(cleaned) || DANGEROUS_ATTR_REGEX.test(cleaned)) {
      state.dangerous = true
    }
    return cleaned
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeRichtextJsonNode(item, state))
  }

  if (!isPlainObject(value)) {
    return value
  }

  const next: Record<string, unknown> = {}
  for (const [key, rawEntry] of Object.entries(value)) {
    const loweredKey = key.toLowerCase()
    if (loweredKey.startsWith('on')) {
      state.dangerous = true
    }
    if (
      loweredKey === 'type' &&
      typeof rawEntry === 'string' &&
      DANGEROUS_RICHTEXT_NODE_TYPES.has(rawEntry.toLowerCase())
    ) {
      state.dangerous = true
    }
    if (
      LINK_LIKE_RICHTEXT_ATTRS.has(loweredKey) &&
      typeof rawEntry === 'string' &&
      DANGEROUS_PROTOCOL_REGEX.test(rawEntry)
    ) {
      state.dangerous = true
    }
    next[key] = sanitizeRichtextJsonNode(rawEntry, state)
  }

  return next
}

function sanitizeRichtextJson(value: Record<string, unknown>): {
  value: Record<string, unknown>
  dangerous: boolean
  valid: boolean
  size: number
} {
  const state = { dangerous: false }
  const sanitized = sanitizeRichtextJsonNode(value, state)
  const asObject = isPlainObject(sanitized) ? sanitized : {}
  const valid = asObject.type === 'doc'
  const serialized = JSON.stringify(asObject)
  return {
    value: asObject,
    dangerous: state.dangerous,
    valid,
    size: serialized.length,
  }
}

function unwrapRichtextPayload(value: unknown): { inner: unknown; wrapAsEnvelope: boolean } {
  if (isRichtextEnvelopeV1(value)) {
    return { inner: value.doc, wrapAsEnvelope: true }
  }
  return { inner: value, wrapAsEnvelope: false }
}

function sanitizeRichtext(value: unknown): {
  value: unknown
  dangerous: boolean
  valid: boolean
  size: number
} {
  const { inner, wrapAsEnvelope } = unwrapRichtextPayload(value)

  if (typeof inner === 'string') {
    const sanitized = sanitizeRichtextString(inner)
    return {
      value: sanitized.value,
      dangerous: sanitized.dangerous,
      valid: true,
      size: sanitized.size,
    }
  }
  if (isPlainObject(inner)) {
    const jsonResult = sanitizeRichtextJson(inner)
    if (!jsonResult.valid) {
      return {
        value,
        dangerous: jsonResult.dangerous,
        valid: false,
        size: jsonResult.size,
      }
    }
    const outValue = wrapAsEnvelope
      ? { schemaVersion: RICHTEXT_SCHEMA_VERSION, doc: jsonResult.value }
      : jsonResult.value
    return {
      value: outValue,
      dangerous: jsonResult.dangerous,
      valid: true,
      size: JSON.stringify(outValue).length,
    }
  }
  return {
    value,
    dangerous: false,
    valid: false,
    size: 0,
  }
}

function requiredAliases(seed: Seed, operation: 'create' | 'update'): string[] {
  return seed.branches
    .filter((branch) => (operation === 'create' ? branch.requiredOnCreate : branch.requiredOnUpdate))
    .map((branch) => branch.alias)
}

function getPreprocessEmpty(allowNull: boolean) {
  return (schema: z.ZodType<unknown>) =>
    z.preprocess((val) => (val === '' || val === null ? (allowNull ? null : undefined) : val), schema.optional())
}

function buildTextSchema(options: Required<ValidateSeedPayloadOptions>, nullable: z.ZodNull | null) {
  const schema = stringSchema
    .transform((value) => sanitizePlainString(value))
    .refine((value) => value.length <= options.maxTextLength, {
      message: `Expected string(max:${options.maxTextLength})`,
    })
  return nullable ? z.union([schema, nullable]) : schema
}

function buildRichtextSchema(options: Required<ValidateSeedPayloadOptions>, nullable: z.ZodNull | null) {
  const schema = z.any().transform((value, ctx) => {
    const sanitized = sanitizeRichtext(value)
    if (!sanitized.valid) {
      ctx.addIssue({
        code: 'custom',
        message: 'Expected richtext-json|string',
        params: { expected: 'richtext-json|string' },
      })
    }
    if (sanitized.size > options.maxTextLength) {
      ctx.addIssue({
        code: 'custom',
        message: `Expected richtext(max:${options.maxTextLength})`,
        params: { expected: `richtext(max:${options.maxTextLength})` },
      })
    }
    if (sanitized.dangerous) {
      ctx.addIssue({
        code: 'custom',
        message: 'Dangerous richtext content',
        params: { dangerous: true },
      })
    }
    return sanitized.value
  })
  return nullable ? z.union([schema, nullable]) : schema
}

function buildNumberSchema(branch: Branch, allowNull: boolean, nullable: z.ZodNull | null) {
  const opts = branch.numberOptions
  const numSchema = z.number()
  
  const refinedSchema = numSchema.superRefine((val, ctx) => {
    if (!Number.isFinite(val)) {
      ctx.addIssue({ code: 'custom', message: 'Expected finite number' })
      return z.NEVER
    }
    if (opts?.min !== undefined && val < opts.min) {
      ctx.addIssue({ code: 'custom', message: `Expected number(min:${opts.min})` })
      return z.NEVER
    }
    if (opts?.max !== undefined && val > opts.max) {
      ctx.addIssue({ code: 'custom', message: `Expected number(max:${opts.max})` })
      return z.NEVER
    }
    if (opts?.step !== undefined) {
      const step = opts.step
      const min = opts.min ?? 0
      const valDecimals = (val.toString().split('.')[1] || '').length
      const stepDecimals = (step.toString().split('.')[1] || '').length
      const decimals = Math.max(valDecimals, stepDecimals)
      const multiplier = Math.pow(10, decimals)
      if ((Math.round((val - min) * multiplier) % Math.round(step * multiplier)) !== 0) {
        ctx.addIssue({ code: 'custom', message: `Expected number(step:${step})` })
      }
    }
  })

  const schema = getPreprocessEmpty(allowNull)(refinedSchema)
  return nullable ? z.union([schema, nullable]) : schema
}

function buildDateSchema(allowNull: boolean, nullable: z.ZodNull | null) {
  const schema = getPreprocessEmpty(allowNull)(
    stringSchema
      .transform((value) => sanitizePlainString(value as string))
      .refine((value) => isIsoDateString(value), { message: 'Expected date(ISO)' })
  )
  return nullable ? z.union([schema, nullable]) : schema
}

function buildFileSchema(branch: Branch, allowNull: boolean, nullable: z.ZodNull | null) {
  if (isAssetListBranch(branch)) {
    const schema = getPreprocessEmpty(allowNull)(
      z.any()
        .transform((rawValue, ctx) => {
          const normalized = normalizeAssetListValue(rawValue)
          if (!normalized) {
            ctx.addIssue({ code: 'custom', message: 'Expected url-string[]' })
            return z.NEVER
          }
          return normalized
        })
        .pipe(z.array(z.string().url()))
    )
    return nullable ? z.union([schema, nullable]) : schema
  }
  const schema = getPreprocessEmpty(allowNull)(
    z.any()
      .transform((rawValue, ctx) => {
        const normalized = normalizeHttpUrl(rawValue)
        if (!normalized) {
          ctx.addIssue({ code: 'custom', message: 'Expected url-string' })
          return z.NEVER
        }
        return normalized
      })
      .pipe(z.string().url())
  )
  return nullable ? z.union([schema, nullable]) : schema
}

function buildBranchSchema(
  branch: Branch,
  options: Required<ValidateSeedPayloadOptions>
): z.ZodType<unknown> {
  const nullable = options.allowNull ? z.null() : null

  switch (branch.type) {
    case 'text':
      return buildTextSchema(options, nullable)
    case 'richtext':
      return buildRichtextSchema(options, nullable)
    case 'number':
      return buildNumberSchema(branch, options.allowNull, nullable)
    case 'boolean': {
      const schema = getPreprocessEmpty(options.allowNull)(booleanSchema)
      return nullable ? z.union([schema, nullable]) : schema
    }
    case 'date':
      return buildDateSchema(options.allowNull, nullable)
    case 'json':
    case 'tags': {
      const schema = getPreprocessEmpty(options.allowNull)(jsonObjectOrArraySchema)
      return nullable ? z.union([schema, nullable]) : schema
    }
    case 'file':
      return buildFileSchema(branch, options.allowNull, nullable)
    default:
      throw new Error(`Unhandled branch type: ${(branch as any).type}`)
  }
}

const compiledSchemaCache = new Map<string, z.ZodObject<Record<string, z.ZodType<unknown>>>>()

function seedFingerprint(seed: Seed): string {
  return JSON.stringify({
    slug: seed.slug,
    branches: seed.branches.map((branch) => ({
      alias: branch.alias,
      type: branch.type,
      format: branch.format ?? null,
      multiple: branch.multiple ?? false,
      requiredOnCreate: branch.requiredOnCreate ?? false,
      requiredOnUpdate: branch.requiredOnUpdate ?? false,
      numberOptions: branch.numberOptions ?? null,
    })),
  })
}

function compileSeedSchema(
  seed: Seed,
  options: Required<ValidateSeedPayloadOptions>
): z.ZodObject<Record<string, z.ZodType<unknown>>> {
  const key = JSON.stringify({
    fingerprint: seedFingerprint(seed),
    operation: options.operation,
    allowNull: options.allowNull,
    maxTextLength: options.maxTextLength,
  })
  const cached = compiledSchemaCache.get(key)
  if (cached) return cached

  const required = new Set(requiredAliases(seed, options.operation))
  const shape: Record<string, z.ZodType<unknown>> = {}
  for (const branch of seed.branches) {
    const baseSchema = buildBranchSchema(branch, options)
    shape[branch.alias] = required.has(branch.alias) ? baseSchema : baseSchema.optional()
  }

  const compiled = z.object(shape).strict()
  compiledSchemaCache.set(key, compiled)
  return compiled
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
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return false
  const d = new Date(parsed)
  return d.toISOString().startsWith(value.substring(0, 10))
}

function filterPayloadAliases(seed: Seed, payload: Record<string, unknown>) {
  const unknownAliases: string[] = []
  const details: ValidationDetail[] = []
  const allowedAliases = new Set(seed.branches.map((branch) => branch.alias))
  const filteredPayload: Record<string, unknown> = {}

  for (const [alias, rawValue] of Object.entries(payload)) {
    if (!allowedAliases.has(alias)) {
      unknownAliases.push(alias)
      details.push({
        field: alias,
        expected: 'known-seed-alias',
        received: 'unknown-alias',
        message: `Field '${alias}' is not defined in seed '${seed.slug}'`,
      })
      continue
    }
    filteredPayload[alias] = rawValue
  }
  return { filteredPayload, unknownAliases, unknownDetails: details }
}

function collectZodIssueDetails(
  seed: Seed,
  issues: z.ZodIssue[],
  filteredPayload: Record<string, unknown>,
  normalizedOptions: Required<ValidateSeedPayloadOptions>
) {
  const unknownAliases: string[] = []
  const details: ValidationDetail[] = []
  const dangerousFields: string[] = []

  for (const issue of issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const alias of issue.keys) {
        unknownAliases.push(alias)
        details.push({
          field: alias,
          expected: 'known-seed-alias',
          received: 'unknown-alias',
          message: `Field '${alias}' is not defined in seed '${seed.slug}'`,
        })
      }
      continue
    }

    if (issue.message === 'Required' && normalizedOptions.enforceRequiredFields) {
      continue // Let enforceRequiredFields logic handle it properly
    }

    const field = String(issue.path[0] ?? 'payload')
    const receivedValue = filteredPayload[field]
    const expected =
      typeof issue.message === 'string' && issue.message.startsWith('Expected ')
        ? issue.message.replace('Expected ', '')
        : 'valid-field-value'
    if ((issue as { params?: Record<string, unknown> }).params?.dangerous === true) {
      dangerousFields.push(field)
    }
    details.push(makeDetail(field, expected, receivedValue))
  }
  return { unknownAliases, zodDetails: details, dangerousFields }
}

function enforceRequiredFields(
  seed: Seed,
  payload: Record<string, unknown>,
  filteredPayload: Record<string, unknown>,
  data: Record<string, unknown>,
  isSuccess: boolean,
  normalizedOptions: Required<ValidateSeedPayloadOptions>
) {
  const requiredFieldsMissing: string[] = []
  const details: ValidationDetail[] = []

  for (const branch of seed.branches) {
    const isRequired =
      normalizedOptions.operation === 'create' ? branch.requiredOnCreate : branch.requiredOnUpdate
    if (!isRequired) continue

    const hasProvidedAlias = Object.hasOwn(payload, branch.alias)
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

    const valueToCheck = isSuccess ? data[branch.alias] : filteredPayload[branch.alias]

    if (isMissingRequiredValue(valueToCheck)) {
      requiredFieldsMissing.push(branch.alias)
      details.push({
        field: branch.alias,
        expected: 'required-field',
        received: 'empty',
        message: `Field '${branch.alias}' cannot be empty for ${normalizedOptions.operation}`,
      })
    }
  }
  return { requiredFieldsMissing, requiredDetails: details }
}

/**
 * Common foundation for schema-driven validation and sanitization of payloads.
 * Used by the Public API and reusable in the Botanical Engine.
 *
 * Mandatory execution order at the time of writing:
 *   validate raw → hash (privacy policy) → store
 * Hashing occurs AFTER validation, not before.
 * This ensures that the validated value is the original raw value,
 * not the digest — avoiding false failures on fields with formats (e.g., email).
 */
export function validateAndSanitizeSeedPayload(
  seed: Seed,
  payload: Record<string, unknown>,
  options: ValidateSeedPayloadOptions = {}
): ValidateSeedPayloadResult {
  const normalizedOptions: Required<ValidateSeedPayloadOptions> = {
    allowNull: options.allowNull ?? false,
    operation: options.operation ?? 'create',
    requireAtLeastOneValidField: options.requireAtLeastOneValidField ?? true,
    enforceRequiredFields: options.enforceRequiredFields ?? true,
    maxTextLength: options.maxTextLength ?? DEFAULT_MAX_TEXT_LENGTH,
  }

  const { filteredPayload, unknownAliases: initialUnknown, unknownDetails } = filterPayloadAliases(seed, payload)
  const schema = compileSeedSchema(seed, normalizedOptions)
  const parsed = schema.safeParse(filteredPayload)

  const data = parsed.success ? { ...parsed.data } : {}
  const { unknownAliases: zodUnknown, zodDetails, dangerousFields } = parsed.success
    ? { unknownAliases: [], zodDetails: [], dangerousFields: [] }
    : collectZodIssueDetails(seed, parsed.error.issues, filteredPayload, normalizedOptions)

  const { requiredFieldsMissing, requiredDetails } = normalizedOptions.enforceRequiredFields
    ? enforceRequiredFields(seed, payload, filteredPayload, data, parsed.success, normalizedOptions)
    : { requiredFieldsMissing: [], requiredDetails: [] }

  const details = [...unknownDetails, ...zodDetails, ...requiredDetails]

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
    unknownAliases: [...new Set([...initialUnknown, ...zodUnknown])],
    dangerousFields: [...new Set(dangerousFields)],
    requiredFieldsMissing,
    hasAnyValidField: Object.keys(data).length > 0,
  }
}

/**
 * Validates content status supported by the CMS.
 */
export function isValidContentStatus(value: unknown): value is 'draft' | 'review' | 'published' {
  return statusSchema.safeParse(value).success
}

/**
 * Full Zod runtime compiler:
 * - compile per-seed/per-operation with cache
 * - strict unknown aliases
 * - required fields by operation
 */
