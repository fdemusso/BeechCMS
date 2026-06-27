// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { z } from 'zod'
import type { Branch, BranchType, Seed } from './types.js'
import { RICHTEXT_SCHEMA_VERSION, isRichtextEnvelopeV1 } from './richtext.js'
import type { FileAccept } from './file-types.js'
import { extensionFromUrl, isExtensionAccepted } from './file-types.js'
import type { IIdGenerator } from './id-generator.js'

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
  /**
   * Required when the seed has branches of type `'relation'`.
   * Must be the same IIdGenerator instance used for id generation so that
   * swapping implementations (e.g. ULIDs) automatically updates validation.
   * Do NOT pass a concrete class — inject via the middleware / factory.
   */
  idGenerator?: IIdGenerator
}

export interface ValidateSeedPayloadResult {
  data: Record<string, unknown>
  details: ValidationDetail[]
  unknownAliases: string[]
  dangerousFields: string[]
  requiredFieldsMissing: string[]
  hasAnyValidField: boolean
}

type ResolvedOptions = {
  allowNull: boolean
  operation: 'create' | 'update'
  requireAtLeastOneValidField: boolean
  enforceRequiredFields: boolean
  maxTextLength: number
  idGenerator: IIdGenerator | undefined
}

const DEFAULT_MAX_TEXT_LENGTH = 50_000
const DEFAULT_FILE_MAX_SIZE = 5 * 1024 * 1024

const CONTROL_CHARS_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
const DANGEROUS_TAG_REGEX = /<(script|iframe|object|embed)\b/i
const DANGEROUS_TAG_STRIP_REGEX = /<\/?(script|iframe|object|embed)[^>]*>/gi
const DANGEROUS_ATTR_REGEX = /\son[a-z]+\s*=/i
const DANGEROUS_HANDLER_STRIP_REGEX = /\son[a-z]+\s*=\s*(['"]).*?\1/gi
const DANGEROUS_PROTOCOL_REGEX = /^\s*javascript:/i
const FORBIDDEN_RICHTEXT_NODE_TYPES = new Set(['script', 'iframe', 'object', 'embed'])
const URL_LIKE_RICHTEXT_KEYS = new Set(['href', 'src'])

const STATUS_VALUES = ['draft', 'review', 'published'] as const
const statusSchema = z.enum(STATUS_VALUES)

// ──────────────────────────────────────────────────────────────────────────────
// Primitive helpers
// ──────────────────────────────────────────────────────────────────────────────

function stripControlChars(input: string): string {
  return input.replaceAll(CONTROL_CHARS_REGEX, '')
}

function cleanString(input: string): string {
  return stripControlChars(input).trim()
}

function isPlainObject(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input)
}

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function parseHttpUrl(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const cleaned = cleanString(input)
  if (cleaned.length === 0) return null
  let parsed: URL
  try {
    parsed = new URL(cleaned)
  } catch {
    return null
  }
  return parsed.protocol.startsWith('http') ? cleaned : null
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return false
  const ts = Date.parse(value)
  if (Number.isNaN(ts)) return false
  return new Date(ts).toISOString().startsWith(value.slice(0, 10))
}

// ──────────────────────────────────────────────────────────────────────────────
// File branch helpers
// ──────────────────────────────────────────────────────────────────────────────

export function resolveFileOptions(branch: Branch): { accept: FileAccept; maxSize: number } {
  const opts = branch.fileOptions
  return {
    accept: opts?.accept ?? 'any',
    maxSize: opts?.maxSize ?? DEFAULT_FILE_MAX_SIZE,
  }
}

function isAssetListBranch(branch: Branch): boolean {
  return branch.type === 'file' && (branch.multiple === true || branch.format === 'asset-list')
}

function extractUrlFromCandidate(candidate: unknown): string | null {
  const direct = parseHttpUrl(candidate)
  if (direct) return direct
  if (isPlainObject(candidate)) {
    return parseHttpUrl(candidate.url)
  }
  return null
}

function collectAssetListUrls(raw: unknown): string[] | null {
  const source = typeof raw === 'string' ? tryParseJson(raw) : raw
  const items = Array.isArray(source) ? source : [source]
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of items) {
    if (item === null || item === undefined) continue
    const url = extractUrlFromCandidate(item)
    if (!url) return null
    if (!seen.has(url)) {
      seen.add(url)
      out.push(url)
    }
  }
  return out
}

// ──────────────────────────────────────────────────────────────────────────────
// Richtext sanitization
// ──────────────────────────────────────────────────────────────────────────────

interface RichtextSanitizeResult {
  value: unknown
  dangerous: boolean
  valid: boolean
  size: number
}

interface SanitizeState {
  dangerous: boolean
}

function sanitizeRichtextString(raw: string): RichtextSanitizeResult {
  const noControls = stripControlChars(raw)
  const dangerous = DANGEROUS_TAG_REGEX.test(noControls) || DANGEROUS_ATTR_REGEX.test(noControls)
  const noTags = noControls.replaceAll(DANGEROUS_TAG_STRIP_REGEX, '')
  const noHandlers = noTags.replaceAll(DANGEROUS_HANDLER_STRIP_REGEX, '')
  const finalValue = noHandlers.trim()
  return { value: finalValue, dangerous, valid: true, size: finalValue.length }
}

function walkRichtextNode(node: unknown, state: SanitizeState): unknown {
  if (typeof node === 'string') {
    const cleaned = stripControlChars(node)
    if (DANGEROUS_TAG_REGEX.test(cleaned) || DANGEROUS_ATTR_REGEX.test(cleaned)) {
      state.dangerous = true
    }
    return cleaned
  }
  if (Array.isArray(node)) {
    return node.map((child) => walkRichtextNode(child, state))
  }
  if (!isPlainObject(node)) return node

  const result: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(node)) {
    const lower = key.toLowerCase()
    if (lower.startsWith('on')) {
      state.dangerous = true
    }
    if (lower === 'type' && typeof entry === 'string') {
      if (FORBIDDEN_RICHTEXT_NODE_TYPES.has(entry.toLowerCase())) {
        state.dangerous = true
      }
    }
    if (URL_LIKE_RICHTEXT_KEYS.has(lower) && typeof entry === 'string' && DANGEROUS_PROTOCOL_REGEX.test(entry)) {
      state.dangerous = true
    }
    result[key] = walkRichtextNode(entry, state)
  }
  return result
}

function sanitizeRichtextJson(raw: Record<string, unknown>): RichtextSanitizeResult {
  const state: SanitizeState = { dangerous: false }
  const cleaned = walkRichtextNode(raw, state)
  const asObject = isPlainObject(cleaned) ? cleaned : {}
  const valid = asObject.type === 'doc'
  const serialized = JSON.stringify(asObject)
  return { value: asObject, dangerous: state.dangerous, valid, size: serialized.length }
}

function sanitizeRichtext(raw: unknown): RichtextSanitizeResult {
  const envelopeMode = isRichtextEnvelopeV1(raw)
  const payload = envelopeMode ? (raw as { doc: unknown }).doc : raw

  if (typeof payload === 'string') {
    return sanitizeRichtextString(payload)
  }
  if (isPlainObject(payload)) {
    const jsonResult = sanitizeRichtextJson(payload)
    if (!jsonResult.valid) {
      return { value: raw, dangerous: jsonResult.dangerous, valid: false, size: jsonResult.size }
    }
    const finalValue = envelopeMode
      ? { schemaVersion: RICHTEXT_SCHEMA_VERSION, doc: jsonResult.value }
      : jsonResult.value
    return {
      value: finalValue,
      dangerous: jsonResult.dangerous,
      valid: true,
      size: JSON.stringify(finalValue).length,
    }
  }
  return { value: raw, dangerous: false, valid: false, size: 0 }
}

function gatherRichtextText(node: unknown, sink: string[]): void {
  if (Array.isArray(node)) {
    for (const child of node) gatherRichtextText(child, sink)
    return
  }
  if (!isPlainObject(node)) return
  if (typeof node.text === 'string') {
    sink.push(cleanString(node.text))
  }
  if (isPlainObject(node.attrs) && typeof node.attrs.latex === 'string') {
    sink.push(cleanString(node.attrs.latex))
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) gatherRichtextText(child, sink)
  }
}

function isRichtextDocEmpty(value: unknown): boolean {
  if (!isPlainObject(value)) return false
  if (isRichtextEnvelopeV1(value)) {
    return isRichtextDocEmpty(value.doc)
  }
  if (value.type !== 'doc') return false
  const sink: string[] = []
  gatherRichtextText(value, sink)
  return sink.join('').trim().length === 0
}

// ──────────────────────────────────────────────────────────────────────────────
// Schema builders per branch type
// ──────────────────────────────────────────────────────────────────────────────

function withNullable<T extends z.ZodTypeAny>(schema: T, allowNull: boolean): z.ZodTypeAny {
  return allowNull ? z.union([schema, z.null()]) : schema
}

function withEmptyPreprocessing<T extends z.ZodTypeAny>(schema: T, allowNull: boolean): z.ZodTypeAny {
  const fallback = allowNull ? null : undefined
  return z.preprocess(
    (val) => (val === '' || val === null ? fallback : val),
    schema.optional(),
  )
}

function textSchema(options: ResolvedOptions, allowNull: boolean): z.ZodTypeAny {
  const inner = z
    .string()
    .transform((value) => cleanString(value))
    .refine((value) => value.length <= options.maxTextLength, {
      message: `Expected string(max:${options.maxTextLength})`,
    })
  return withNullable(inner, allowNull)
}

function richtextSchema(options: ResolvedOptions, allowNull: boolean): z.ZodTypeAny {
  const inner = z.any().transform((value, ctx) => {
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
  return withNullable(inner, allowNull)
}

function numberSchema(branch: Branch, allowNull: boolean): z.ZodTypeAny {
  const opts = branch.numberOptions
  const base = z.number().superRefine((val, ctx) => {
    if (!Number.isFinite(val)) {
      ctx.addIssue({ code: 'custom', message: 'Expected finite number' })
      return
    }
    if (opts?.min !== undefined && val < opts.min) {
      ctx.addIssue({ code: 'custom', message: `Expected number(min:${opts.min})` })
      return
    }
    if (opts?.max !== undefined && val > opts.max) {
      ctx.addIssue({ code: 'custom', message: `Expected number(max:${opts.max})` })
      return
    }
    if (opts?.step !== undefined) {
      const step = opts.step
      const origin = opts.min ?? 0
      const valDecimals = (val.toString().split('.')[1] ?? '').length
      const stepDecimals = (step.toString().split('.')[1] ?? '').length
      const scale = 10 ** Math.max(valDecimals, stepDecimals)
      const offset = Math.round((val - origin) * scale)
      const stepScaled = Math.round(step * scale)
      if (stepScaled !== 0 && offset % stepScaled !== 0) {
        ctx.addIssue({ code: 'custom', message: `Expected number(step:${step})` })
      }
    }
  })
  return withNullable(withEmptyPreprocessing(base, allowNull), allowNull)
}

function booleanSchema(allowNull: boolean): z.ZodTypeAny {
  return withNullable(withEmptyPreprocessing(z.boolean(), allowNull), allowNull)
}

function dateSchema(allowNull: boolean): z.ZodTypeAny {
  const base = z
    .string()
    .transform((value) => cleanString(value as string))
    .refine((value) => isValidIsoDate(value), { message: 'Expected date(ISO)' })
  return withNullable(withEmptyPreprocessing(base, allowNull), allowNull)
}

function jsonOrTagsSchema(allowNull: boolean): z.ZodTypeAny {
  const base = z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())])
  return withNullable(withEmptyPreprocessing(base, allowNull), allowNull)
}

function relationSchema(branch: Branch, options: ResolvedOptions): z.ZodTypeAny {
  const gen = options.idGenerator
  if (!gen) {
    throw new Error(
      'IIdGenerator must be provided in ValidateSeedPayloadOptions when validating seeds with relation branches. ' +
      'Pass `idGenerator` (e.g. SystemIdGenerator) in the options object.',
    )
  }
  const idSchema = z.string().refine(
    (value) => gen.isValid(value),
    { message: 'Invalid relation id format' },
  )
  // Many-to-many: expect string[] with no duplicates
  if (branch.multiple === true) {
    const arraySchema = z.array(idSchema).refine(
      (arr) => new Set(arr).size === arr.length,
      { message: 'Duplicate ids in multi-relation array' },
    )
    return options.allowNull ? z.union([arraySchema, z.null()]) : arraySchema
  }
  return withNullable(idSchema, options.allowNull)
}

function fileSchema(branch: Branch, allowNull: boolean): z.ZodTypeAny {
  const { accept } = resolveFileOptions(branch)
  const verifyExtension = (url: string, ctx: z.RefinementCtx): boolean => {
    if (accept === 'any') return true
    const ext = extensionFromUrl(url)
    if (isExtensionAccepted(ext, accept)) return true
    ctx.addIssue({ code: 'custom', message: `Expected file(accept:${accept})` })
    return false
  }

  if (isAssetListBranch(branch)) {
    const inner = z
      .any()
      .transform((raw, ctx) => {
        const urls = collectAssetListUrls(raw)
        if (urls === null) {
          ctx.addIssue({ code: 'custom', message: 'Expected url-string[]' })
          return z.NEVER
        }
        for (const url of urls) {
          if (!verifyExtension(url, ctx)) return z.NEVER
        }
        return urls
      })
      .pipe(z.array(z.string().url()))
    return withNullable(withEmptyPreprocessing(inner, allowNull), allowNull)
  }

  const inner = z
    .any()
    .transform((raw, ctx) => {
      const url = parseHttpUrl(raw)
      if (!url) {
        ctx.addIssue({ code: 'custom', message: 'Expected url-string' })
        return z.NEVER
      }
      if (!verifyExtension(url, ctx)) return z.NEVER
      return url
    })
    .pipe(z.string().url())
  return withNullable(withEmptyPreprocessing(inner, allowNull), allowNull)
}

// Sub-branches of a `repeater` are restricted to leaf/scalar types — no nested
// `repeater`, `relation`, or `file` (v1 restriction, see types.ts Branch.fields).
const REPEATER_DISALLOWED_SUBTYPES = new Set<BranchType>(['repeater', 'relation', 'file'])

function repeaterSchema(branch: Branch, options: ResolvedOptions): z.ZodTypeAny {
  const requiredFlag = options.operation === 'create' ? 'requiredOnCreate' : 'requiredOnUpdate'
  const subBranches = (branch.fields ?? []).filter((sub) => !REPEATER_DISALLOWED_SUBTYPES.has(sub.type))

  const shape: Record<string, z.ZodTypeAny> = {}
  for (const sub of subBranches) {
    const subSchema = schemaForBranch(sub, options)
    shape[sub.alias] = sub[requiredFlag] ? subSchema : subSchema.optional()
  }
  // z.object() strips unknown keys by default — old item shapes from a renamed/
  // removed sub-field are dropped rather than rejected (sprint 10 §5.1).
  const itemSchema = z.object(shape)
  let arraySchema = z.array(itemSchema)
  if (Number.isInteger(branch.minItems) && (branch.minItems as number) >= 0) {
    arraySchema = arraySchema.min(branch.minItems as number, {
      message: `Expected array(min:${branch.minItems})`,
    })
  }
  if (Number.isInteger(branch.maxItems) && (branch.maxItems as number) >= 0) {
    arraySchema = arraySchema.max(branch.maxItems as number, {
      message: `Expected array(max:${branch.maxItems})`,
    })
  }
  return withNullable(withEmptyPreprocessing(arraySchema, options.allowNull), options.allowNull)
}

const BRANCH_SCHEMA_BUILDERS: Record<string, (branch: Branch, options: ResolvedOptions) => z.ZodTypeAny> = {
  text: (_branch, options) => textSchema(options, options.allowNull),
  richtext: (_branch, options) => richtextSchema(options, options.allowNull),
  number: (branch, options) => numberSchema(branch, options.allowNull),
  boolean: (_branch, options) => booleanSchema(options.allowNull),
  date: (_branch, options) => dateSchema(options.allowNull),
  json: (_branch, options) => jsonOrTagsSchema(options.allowNull),
  tags: (_branch, options) => jsonOrTagsSchema(options.allowNull),
  file: (branch, options) => fileSchema(branch, options.allowNull),
  relation: (branch, options) => relationSchema(branch, options),
  repeater: (branch, options) => repeaterSchema(branch, options),
}

function schemaForBranch(branch: Branch, options: ResolvedOptions): z.ZodTypeAny {
  const builder = BRANCH_SCHEMA_BUILDERS[branch.type]
  if (!builder) {
    throw new Error(`Unhandled branch type: ${(branch as { type: string }).type}`)
  }
  return builder(branch, options)
}

// ──────────────────────────────────────────────────────────────────────────────
// Seed schema compilation with cache
// ──────────────────────────────────────────────────────────────────────────────

const seedSchemaCache = new Map<string, z.ZodObject<Record<string, z.ZodTypeAny>>>()

function buildSeedFingerprint(seed: Seed): string {
  const parts = seed.branches.map((branch) => ({
    a: branch.alias,
    t: branch.type,
    f: branch.format ?? null,
    m: branch.multiple === true,
    rc: branch.requiredOnCreate === true,
    ru: branch.requiredOnUpdate === true,
    n: branch.numberOptions ?? null,
    fi: branch.fileOptions ?? null,
    mi: branch.minItems ?? null,
    ma: branch.maxItems ?? null,
    sub: branch.fields?.map((sub) => ({
      a: sub.alias,
      t: sub.type,
      rc: sub.requiredOnCreate === true,
      ru: sub.requiredOnUpdate === true,
    })) ?? null,
  }))
  return JSON.stringify({ s: seed.slug, b: parts })
}

function buildCacheKey(seed: Seed, options: ResolvedOptions): string {
  return [
    buildSeedFingerprint(seed),
    options.operation,
    options.allowNull ? '1' : '0',
    String(options.maxTextLength),
  ].join('|')
}

function compileSeedSchema(seed: Seed, options: ResolvedOptions): z.ZodObject<Record<string, z.ZodTypeAny>> {
  // Seeds with relation branches cannot be safely cached because the schema
  // captures the idGenerator by closure, and different generators (e.g.
  // SystemIdGenerator vs SequentialIdGenerator) have different isValid() semantics.
  const hasRelation = seed.branches.some((b) => b.type === 'relation')

  if (!hasRelation) {
    const key = buildCacheKey(seed, options)
    const cached = seedSchemaCache.get(key)
    if (cached) return cached
  }

  const requiredFlag = options.operation === 'create' ? 'requiredOnCreate' : 'requiredOnUpdate'
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const branch of seed.branches) {
    const branchSchema = schemaForBranch(branch, options)
    const isRequired = branch[requiredFlag] && options.enforceRequiredFields
    shape[branch.alias] = isRequired ? branchSchema : branchSchema.optional()
  }
  const compiled = z.object(shape).strict()

  if (!hasRelation) {
    const key = buildCacheKey(seed, options)
    seedSchemaCache.set(key, compiled)
  }

  return compiled
}

// ──────────────────────────────────────────────────────────────────────────────
// Required-field enforcement
// ──────────────────────────────────────────────────────────────────────────────

function isEffectivelyEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return cleanString(value).length === 0
  if (Array.isArray(value)) return value.length === 0
  if (isPlainObject(value)) {
    if (isRichtextEnvelopeV1(value)) return isRichtextDocEmpty(value.doc)
    if (isRichtextDocEmpty(value)) return true
    return Object.keys(value).length === 0
  }
  return false
}

function detectMissingRequired(
  seed: Seed,
  rawPayload: Record<string, unknown>,
  filtered: Record<string, unknown>,
  parsedData: Record<string, unknown>,
  parseSucceeded: boolean,
  options: ResolvedOptions,
): { missing: string[]; details: ValidationDetail[] } {
  const missing: string[] = []
  const details: ValidationDetail[] = []
  const op = options.operation

  for (const branch of seed.branches) {
    const isRequired = op === 'create' ? branch.requiredOnCreate : branch.requiredOnUpdate
    if (!isRequired) continue

    if (!Object.hasOwn(rawPayload, branch.alias)) {
      missing.push(branch.alias)
      details.push({
        field: branch.alias,
        expected: 'required-field',
        received: 'missing',
        message: `Field '${branch.alias}' is required for ${op}`,
      })
      continue
    }

    const candidate = parseSucceeded ? parsedData[branch.alias] : filtered[branch.alias]
    if (isEffectivelyEmpty(candidate)) {
      missing.push(branch.alias)
      details.push({
        field: branch.alias,
        expected: 'required-field',
        received: 'empty',
        message: `Field '${branch.alias}' cannot be empty for ${op}`,
      })
    }
  }
  return { missing, details }
}

// ──────────────────────────────────────────────────────────────────────────────
// Issue mapping
// ──────────────────────────────────────────────────────────────────────────────

function describeReceivedType(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function expectedFromMessage(message: unknown): string {
  if (typeof message !== 'string') return 'valid-field-value'
  return message.startsWith('Expected ') ? message.slice('Expected '.length) : 'valid-field-value'
}

function splitUnknownAliases(
  seed: Seed,
  payload: Record<string, unknown>,
): { filtered: Record<string, unknown>; unknown: string[]; details: ValidationDetail[] } {
  const knownAliases = new Set(seed.branches.map((branch) => branch.alias))
  const filtered: Record<string, unknown> = {}
  const unknown: string[] = []
  const details: ValidationDetail[] = []

  for (const alias of Object.keys(payload)) {
    if (knownAliases.has(alias)) {
      filtered[alias] = payload[alias]
      continue
    }
    unknown.push(alias)
    details.push({
      field: alias,
      expected: 'known-seed-alias',
      received: 'unknown-alias',
      message: `Field '${alias}' is not defined in seed '${seed.slug}'`,
    })
  }

  return { filtered, unknown, details }
}

function flattenZodIssues(issues: z.ZodIssue[], parentPath: (string | number)[] = []): z.ZodIssue[] {
  const result: z.ZodIssue[] = []
  for (const issue of issues) {
    const issuePath = issue.path as (string | number)[]
    const currentPath = [...parentPath, ...issuePath]
    if (issue.code === 'invalid_union' && 'errors' in issue) {
      const unionErrors = (issue as any).errors as z.ZodIssue[][]
      for (const subIssues of unionErrors) {
        result.push(...flattenZodIssues(subIssues, currentPath))
      }
    } else {
      result.push({
        ...issue,
        path: currentPath,
      })
    }
  }
  return result
}

function processZodIssues(
  seed: Seed,
  issues: z.ZodIssue[],
  filtered: Record<string, unknown>,
  options: ResolvedOptions,
): { details: ValidationDetail[]; unknown: string[]; dangerous: string[] } {
  const details: ValidationDetail[] = []
  const unknown: string[] = []
  const dangerous: string[] = []

  const flatIssues = flattenZodIssues(issues)

  for (const issue of flatIssues) {
    if (issue.code === 'unrecognized_keys') {
      for (const alias of issue.keys) {
        unknown.push(alias)
        details.push({
          field: alias,
          expected: 'known-seed-alias',
          received: 'unknown-alias',
          message: `Field '${alias}' is not defined in seed '${seed.slug}'`,
        })
      }
      continue
    }

    if (issue.message === 'Required' && options.enforceRequiredFields) {
      continue
    }

    const field = String(issue.path[0] ?? 'payload')
    const params = (issue as { params?: Record<string, unknown> }).params
    if (params?.dangerous === true) {
      dangerous.push(field)
    }
    details.push({
      field,
      expected: expectedFromMessage(issue.message),
      received: describeReceivedType(filtered[field]),
      message: `Field '${field}' expects type '${expectedFromMessage(issue.message)}' but received '${describeReceivedType(filtered[field])}'`,
    })
  }

  return { details, unknown, dangerous }
}

// ──────────────────────────────────────────────────────────────────────────────
// Public entry points
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Schema-driven validation and sanitization of a seed payload.
 * - Drops unknown aliases (reports them as details).
 * - Runs branch-specific schemas to coerce / sanitize known values.
 * - Optionally enforces required-on-create / required-on-update branches.
 * - Never throws on malformed input — returns a structured result.
 */
export function validateAndSanitizeSeedPayload(
  seed: Seed,
  payload: Record<string, unknown>,
  options: ValidateSeedPayloadOptions = {},
): ValidateSeedPayloadResult {
  const resolved: ResolvedOptions = {
    allowNull: options.allowNull ?? false,
    operation: options.operation ?? 'create',
    requireAtLeastOneValidField: options.requireAtLeastOneValidField ?? true,
    enforceRequiredFields: options.enforceRequiredFields ?? true,
    maxTextLength: options.maxTextLength ?? DEFAULT_MAX_TEXT_LENGTH,
    idGenerator: options.idGenerator,
  }

  const { filtered, unknown: preUnknown, details: preDetails } = splitUnknownAliases(seed, payload)

  const schema = compileSeedSchema(seed, resolved)
  const parsed = schema.safeParse(filtered)

  const accumulatedDetails: ValidationDetail[] = [...preDetails]
  const unknownAliases = new Set<string>(preUnknown)
  const dangerousFields = new Set<string>()
  let data: Record<string, unknown> = {}

  if (parsed.success) {
    data = { ...parsed.data }
  } else {
    const zodOutcome = processZodIssues(seed, parsed.error.issues, filtered, resolved)
    accumulatedDetails.push(...zodOutcome.details)
    for (const alias of zodOutcome.unknown) unknownAliases.add(alias)
    for (const field of zodOutcome.dangerous) dangerousFields.add(field)
  }

  let requiredFieldsMissing: string[] = []
  if (resolved.enforceRequiredFields) {
    const requiredOutcome = detectMissingRequired(seed, payload, filtered, data, parsed.success, resolved)
    requiredFieldsMissing = requiredOutcome.missing
    accumulatedDetails.push(...requiredOutcome.details)
  }

  if (resolved.requireAtLeastOneValidField && Object.keys(data).length === 0) {
    accumulatedDetails.push({
      field: 'data',
      expected: 'at-least-one-valid-field',
      received: 'empty',
      message: 'Payload does not contain any valid fields for this operation',
    })
  }

  return {
    data,
    details: accumulatedDetails,
    unknownAliases: [...unknownAliases],
    dangerousFields: [...dangerousFields],
    requiredFieldsMissing,
    hasAnyValidField: Object.keys(data).length > 0,
  }
}

/**
 * Type-guard for the content status enum.
 */
export function isValidContentStatus(value: unknown): value is (typeof STATUS_VALUES)[number] {
  return statusSchema.safeParse(value).success
}
