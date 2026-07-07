// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { z } from 'zod'
import type { Branch, BranchType, Seed, NumberFieldOptions, FileFieldOptions } from './types.js'
import { RICHTEXT_SCHEMA_VERSION, isRichtextEnvelopeV1 } from '../content/richtext/richtext.js'
import type { FileAccept } from '../media/file-types.js'
import { extensionFromUrl, isExtensionAccepted } from '../media/file-types.js'
import type { IIdGenerator } from '../common/id-generator.js'

/**
 * @module Engine/Validation
 * 
 * Provides schema-driven validation and sanitization utilities for seed payloads
 * within BeechCMS. This module handles type checks, required fields, text limits,
 * rich text sanitization, relational key checks, and format constraints using Zod schemas.
 */

/**
 * Represents a single validation error detail returned when a seed payload field fails validation.
 */
export interface ValidationDetail {
  /** The name of the alias or field that failed validation. */
  field: string
  /** The expected type, format, or constraint (e.g., `'string'`, `'number(min:1)'`, `'required-field'`). */
  expected: string
  /** The type or status of the value actually received (e.g., `'null'`, `'array'`, `'missing'`). */
  received: string
  /** A human-readable error message explaining why validation failed. */
  message: string
}

/**
 * Options to configure the validation and sanitization behavior of the seed payload.
 */
export interface ValidateSeedPayloadOptions {
  /**
   * Whether to allow fields to be explicitly `null`.
   * @default false
   */
  allowNull?: boolean
  /**
   * The type of operation being validated, which determines whether `requiredOnCreate`
   * or `requiredOnUpdate` branch constraints are applied.
   * @default 'create'
   */
  operation?: 'create' | 'update'
  /**
   * If true, validation will fail if the resulting data payload contains no valid fields.
   * @default true
   */
  requireAtLeastOneValidField?: boolean
  /**
   * Whether to enforce validation of required fields (`requiredOnCreate` or `requiredOnUpdate`).
   * @default true
   */
  enforceRequiredFields?: boolean
  /**
   * The maximum allowed length (in characters/bytes) for text and rich text fields.
   * @default 50000
   */
  maxTextLength?: number
  /**
   * Required when the seed has branches of type `'relation'`.
   * Must be the same `IIdGenerator` instance used for id generation so that
   * swapping implementations (e.g. ULIDs) automatically updates validation.
   * Do NOT pass a concrete class — inject via the middleware / factory.
   */
  idGenerator?: IIdGenerator
}

/**
 * The structured result returned by the seed payload validation process.
 */
export interface ValidateSeedPayloadResult {
  /**
   * The successfully validated and sanitized fields.
   * Only contains valid fields that matched the seed branches.
   */
  data: Record<string, unknown>
  /** Detailed information about all validation errors or unrecognized fields. */
  details: ValidationDetail[]
  /** List of field aliases that were present in the payload but are not defined in the seed. */
  unknownAliases: string[]
  /** List of fields containing potentially dangerous rich text content (e.g. XSS vectors). */
  dangerousFields: string[]
  /** List of required fields that were missing or effectively empty. */
  requiredFieldsMissing: string[]
  /** Flag indicating if the validated data payload contains at least one valid field. */
  hasAnyValidField: boolean
}

/**
 * Internal representation of fully resolved validation options with default values applied.
 */
type ResolvedOptions = {
  allowNull: boolean
  operation: 'create' | 'update'
  requireAtLeastOneValidField: boolean
  enforceRequiredFields: boolean
  maxTextLength: number
  idGenerator: IIdGenerator | undefined
}

/** Default maximum character length allowed for text and rich text branches. */
const DEFAULT_MAX_TEXT_LENGTH = 50_000
/** Default maximum file size in bytes for file branches. */
const DEFAULT_FILE_MAX_SIZE = 5 * 1024 * 1024

/** Matches standard control characters that should be stripped. */
const CONTROL_CHARS_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
/** Allowlisted TipTap node `type` values. Keep in sync with
 *  richtext-render.ts::createRichTextHtmlExtensions. */
const ALLOWED_RICHTEXT_NODE_TYPES = new Set([
  'doc', 'paragraph', 'text', 'heading', 'blockquote', 'bulletList', 'orderedList',
  'listItem', 'codeBlock', 'horizontalRule', 'hardBreak', 'image',
  'table', 'tableRow', 'tableHeader', 'tableCell',
  'inlineMath', 'blockMath', // Mathematics extension
])
/** Allowlisted TipTap mark `type` values. */
const ALLOWED_RICHTEXT_MARK_TYPES = new Set([
  'bold', 'italic', 'strike', 'code', 'link', 'highlight',
  'superscript', 'subscript', 'textStyle',
])
/** Keys that may carry URLs inside a node/mark attrs. */
const URL_LIKE_RICHTEXT_KEYS = new Set(['href', 'src'])
/** Link protocols accepted AFTER normalization. Allowlist, not blocklist. */
const ALLOWED_URL_PROTOCOLS = new Set(['http', 'https', 'mailto', 'tel'])
/** DoS guards, evaluated before the sanitizing walk. */
const RICHTEXT_MAX_DEPTH = 50

/** Set of valid content status values. */
const STATUS_VALUES = ['draft', 'review', 'published'] as const
/** Zod schema for content status enum validation. */
const statusSchema = z.enum(STATUS_VALUES)

// ──────────────────────────────────────────────────────────────────────────────
// Primitive helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Strips non-printable and dangerous control characters from a string.
 * 
 * @param input - The string to clean.
 * @returns The cleaned string.
 */
function stripControlChars(input: string): string {
  return input.replaceAll(CONTROL_CHARS_REGEX, '')
}

/**
 * Cleans a string by stripping control characters and trimming leading/trailing whitespace.
 * 
 * @param input - The string to clean.
 * @returns The cleaned and trimmed string.
 */
function cleanString(input: string): string {
  return stripControlChars(input).trim()
}

/**
 * Type-guard checking if a value is a plain object (excluding arrays and null).
 * 
 * @param input - The value to check.
 * @returns True if the value is a plain object, false otherwise.
 */
function isPlainObject(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input)
}

/**
 * Safely parses a JSON string, returning the parsed value, or the original string if parsing fails.
 * 
 * @param raw - The string to attempt parsing.
 * @returns The parsed object/array, or the original string.
 */
function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

/**
 * Parses a candidate value into a valid HTTP or HTTPS URL string, returning null if invalid.
 * 
 * @param input - The value to validate.
 * @returns The cleaned URL string, or null if invalid.
 */
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

/**
 * Validates if a string is a valid ISO 8601 date.
 * 
 * @param value - The date string to validate.
 * @returns True if the string is a valid ISO date, false otherwise.
 */
function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return false
  const ts = Date.parse(value)
  if (Number.isNaN(ts)) return false
  return new Date(ts).toISOString().startsWith(value.slice(0, 10))
}

// ──────────────────────────────────────────────────────────────────────────────
// File branch helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Resolves the file validation options for a branch, applying default values.
 * 
 * @param branch - The file branch containing option overrides.
 * @returns An object with resolved file acceptance rules and maximum size limit.
 */
export function resolveFileOptions(branch: Branch): { accept: FileAccept; maxSize: number } {
  const opts = branch.fileOptions
  return {
    accept: opts?.accept ?? 'any',
    maxSize: opts?.maxSize ?? DEFAULT_FILE_MAX_SIZE,
  }
}

/**
 * Checks if a branch acts as an asset list (file type with multiple upload allowed or asset-list format).
 * 
 * @param branch - The branch to check.
 * @returns True if it is an asset list, false otherwise.
 */
function isAssetListBranch(branch: Branch): boolean {
  return branch.type === 'file' && (branch.multiple === true || branch.format === 'asset-list')
}

/**
 * Extracts a URL string from a candidate value (which can be a string URL or an object containing a `url` field).
 * 
 * @param candidate - The candidate value.
 * @returns The extracted URL string, or null if not found.
 */
function extractUrlFromCandidate(candidate: unknown): string | null {
  const direct = parseHttpUrl(candidate)
  if (direct) return direct
  if (isPlainObject(candidate)) {
    return parseHttpUrl(candidate.url)
  }
  return null
}

/**
 * Collects and deduplicates valid URLs from a raw input representing an asset list.
 * 
 * @param raw - The raw input data (can be array, JSON string, or single item).
 * @returns The list of unique URL strings, or null if any item is invalid.
 */
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

/** Result structure of the rich text sanitization function. */
interface RichtextSanitizeResult {
  /** The sanitized string or JSON object. */
  value: unknown
  /** Flag indicating if any dangerous content was detected. */
  dangerous: boolean
  /** Flag indicating if the overall structure is valid rich text. */
  valid: boolean
  /** The size of the sanitized result. */
  size: number
  oversize?: boolean
}

/** State tracks if any dangerous tags or attributes were encountered during traversal. */
interface SanitizeState {
  /** Flag indicating if dangerous elements were found. */
  dangerous: boolean
  depth: number
}

/** RichText string input is no longer accepted (JSON-only). Reject as invalid. */
function sanitizeRichtextString(raw: string): RichtextSanitizeResult {
  return { value: raw, dangerous: false, valid: false, size: raw.length }
}

/** Normalizes a URL value and confirms its protocol is allowlisted.
 *  Strips ALL whitespace + control chars first, defeating java\tscript: obfuscation. */
function isProtocolAllowed(raw: string): boolean {
  const normalized = stripControlChars(raw).replace(/\s+/g, '').toLowerCase()
  const schemeMatch = /^([a-z][a-z0-9+.-]*):/.exec(normalized)
  if (!schemeMatch) return true // relative URL / anchor / fragment — no protocol
  return ALLOWED_URL_PROTOCOLS.has(schemeMatch[1])
}

/**
 * Recursively walks a rich text node structure to detect and flag XSS threats and remove control characters.
 * 
 * @param node - The node to walk.
 * @param state - The shared sanitization state tracking danger flags.
 * @returns The cleaned rich text node.
 */
function walkRichtextNode(node: unknown, state: SanitizeState): unknown {
  if (state.depth > RICHTEXT_MAX_DEPTH) {
    state.dangerous = true
    return null
  }
  if (typeof node === 'string') return stripControlChars(node)
  if (Array.isArray(node)) {
    state.depth++
    const mapped = node.map((child) => walkRichtextNode(child, state))
    state.depth--
    return mapped
  }
  if (!isPlainObject(node)) return node

  // Node/mark type allowlist: any `type` not on either allowlist flags dangerous.
  const nodeType = typeof node.type === 'string' ? node.type : undefined
  if (
    nodeType !== undefined &&
    !ALLOWED_RICHTEXT_NODE_TYPES.has(nodeType) &&
    !ALLOWED_RICHTEXT_MARK_TYPES.has(nodeType)
  ) {
    state.dangerous = true
  }

  const result: Record<string, unknown> = {}
  state.depth++
  for (const [key, entry] of Object.entries(node)) {
    const lower = key.toLowerCase()
    if (lower.startsWith('on')) state.dangerous = true // event-handler attr
    if (
      URL_LIKE_RICHTEXT_KEYS.has(lower) &&
      typeof entry === 'string' &&
      !isProtocolAllowed(entry)
    ) {
      state.dangerous = true
    }
    result[key] = walkRichtextNode(entry, state)
  }
  state.depth--
  return result
}

/**
 * Sanitizes a rich text JSON document.
 * 
 * @param raw - The raw rich text JSON object.
 * @returns The sanitization result.
 */
function sanitizeRichtextJson(raw: Record<string, unknown>): RichtextSanitizeResult {
  const state: SanitizeState = { dangerous: false, depth: 0 }
  const cleaned = walkRichtextNode(raw, state)
  const asObject = isPlainObject(cleaned) ? cleaned : {}
  const valid = asObject.type === 'doc'
  const serialized = JSON.stringify(asObject)
  return { value: asObject, dangerous: state.dangerous, valid, size: serialized.length }
}

/**
 * Main entrance helper to sanitize rich text, handling both v1 envelope formats and raw JSON payloads.
 * String-form input is rejected (JSON-only). Byte size is fail-fast checked before the sanitizing walk.
 *
 * @param raw - The raw rich text input.
 * @param maxBytes - Maximum allowed serialized size, checked before the walk.
 * @returns The sanitization result.
 */
function sanitizeRichtext(raw: unknown, maxBytes: number): RichtextSanitizeResult {
  const envelopeMode = isRichtextEnvelopeV1(raw)
  const payload = envelopeMode ? (raw as { doc: unknown }).doc : raw

  if (typeof payload === 'string') {
    return sanitizeRichtextString(payload)
  }
  if (!isPlainObject(payload)) {
    return { value: raw, dangerous: false, valid: false, size: 0 }
  }

  // Fail-fast DoS pre-check: size BEFORE the sanitizing walk.
  const rawSize = JSON.stringify(payload).length
  if (rawSize > maxBytes) {
    return { value: raw, dangerous: false, valid: false, size: rawSize, oversize: true }
  }

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

/**
 * Gathers all text and latex strings from a rich text structure to compute if it contains content.
 * 
 * @param node - The rich text node to inspect.
 * @param sink - Accumulated text chunks.
 */
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

/**
 * Checks if a rich text document is effectively empty (contains no text or LaTeX blocks).
 * 
 * @param value - The rich text document structure.
 * @returns True if empty, false otherwise.
 */
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

/**
 * Wraps a Zod schema to allow null values if `allowNull` is enabled.
 * 
 * @param schema - The base schema to wrap.
 * @param allowNull - Whether to allow null values.
 * @returns The wrapped union schema or the base schema.
 */
function withNullable<T extends z.ZodTypeAny>(schema: T, allowNull: boolean): z.ZodTypeAny {
  return allowNull ? z.union([schema, z.null()]) : schema
}

/**
 * Preprocesses input to convert empty strings or nulls to appropriate fallbacks.
 * 
 * @param schema - The Zod schema to apply post-preprocessing.
 * @param allowNull - Whether null/empty should fall back to null (true) or undefined (false).
 * @returns The preprocessed Zod schema.
 */
function withEmptyPreprocessing<T extends z.ZodTypeAny>(schema: T, allowNull: boolean): z.ZodTypeAny {
  const fallback = allowNull ? null : undefined
  return z.preprocess(
    (val) => (val === '' || val === null ? fallback : val),
    schema.optional(),
  )
}

/**
 * Compiles a Zod validation schema for a text branch.
 * 
 * @param options - The resolved validation options.
 * @param allowNull - Whether null values are allowed.
 * @returns The compiled text schema.
 */
function textSchema(options: ResolvedOptions, allowNull: boolean): z.ZodTypeAny {
  const inner = z
    .string()
    .transform((value) => cleanString(value))
    .refine((value) => value.length <= options.maxTextLength, {
      message: `Expected string(max:${options.maxTextLength})`,
    })
  return withNullable(inner, allowNull)
}

/**
 * Compiles a Zod validation schema for a rich text branch, including sanitization.
 * 
 * @param options - The resolved validation options.
 * @param allowNull - Whether null values are allowed.
 * @returns The compiled rich text schema.
 */
function richtextSchema(options: ResolvedOptions, allowNull: boolean): z.ZodTypeAny {
  const inner = z.any().transform((value, ctx) => {
    const sanitized = sanitizeRichtext(value, options.maxTextLength)
    if (!sanitized.valid) {
      ctx.addIssue({
        code: 'custom',
        message: 'Expected richtext-json|string',
        params: { expected: 'richtext-json|string' },
      })
    }
    if (sanitized.oversize || sanitized.size > options.maxTextLength) {
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

/** Decimal places of a number, correct for scientific notation (1e-7 → 7). */
function decimalPlaces(n: number): number {
  if (!Number.isFinite(n)) return 0
  const s = n.toString()
  if (s.includes('e') || s.includes('E')) {
    const [mantissa, expPart] = s.toLowerCase().split('e')
    const exp = parseInt(expPart, 10)
    const mantDecimals = (mantissa.split('.')[1] ?? '').length
    return Math.max(0, mantDecimals - exp) // exp is negative for small numbers
  }
  return (s.split('.')[1] ?? '').length
}

/**
 * Compiles a Zod validation schema for a number branch with min/max/step checks.
 *
 * @param branch - The number branch definition.
 * @param allowNull - Whether null values are allowed.
 * @returns The compiled number schema.
 */
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
      const valDecimals = decimalPlaces(val)
      const stepDecimals = decimalPlaces(step)
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

/**
 * Compiles a Zod validation schema for a boolean branch.
 * 
 * @param allowNull - Whether null values are allowed.
 * @returns The compiled boolean schema.
 */
function booleanSchema(allowNull: boolean): z.ZodTypeAny {
  return withNullable(withEmptyPreprocessing(z.boolean(), allowNull), allowNull)
}

/**
 * Compiles a Zod validation schema for a date branch checking for valid ISO date format.
 * 
 * @param allowNull - Whether null values are allowed.
 * @returns The compiled date schema.
 */
function dateSchema(allowNull: boolean): z.ZodTypeAny {
  const base = z
    .string()
    .transform((value) => cleanString(value as string))
    .refine((value) => isValidIsoDate(value), { message: 'Expected date(ISO)' })
  return withNullable(withEmptyPreprocessing(base, allowNull), allowNull)
}

/**
 * Compiles a Zod validation schema for JSON or tags branches.
 * 
 * @param allowNull - Whether null values are allowed.
 * @returns The compiled JSON/tags schema.
 */
function jsonOrTagsSchema(allowNull: boolean): z.ZodTypeAny {
  const base = z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())])
  return withNullable(withEmptyPreprocessing(base, allowNull), allowNull)
}

/**
 * Compiles a Zod validation schema for a relation branch, validating ID formats using an ID generator.
 * 
 * @param branch - The relation branch definition.
 * @param options - The resolved validation options.
 * @returns The compiled relation schema.
 */
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

/**
 * Compiles a Zod validation schema for file or asset list branches.
 * 
 * @param branch - The file branch definition.
 * @param allowNull - Whether null values are allowed.
 * @returns The compiled file schema.
 */
function fileSchema(branch: Branch, allowNull: boolean): z.ZodTypeAny {
  const { accept } = resolveFileOptions(branch)
  const verifyExtension = (url: string, ctx: z.RefinementCtx): boolean => {
    if (accept === 'any') return true
    const ext = extensionFromUrl(url)
    if (isExtensionAccepted(ext, accept)) return true
    ctx.addIssue({ code: 'custom', message: `Expected valid-${accept}-url-with-extension` })
    return false
  }

  if (isAssetListBranch(branch)) {
    const inner = z
      .any()
      .transform((raw, ctx) => {
        const urls = collectAssetListUrls(raw)
        if (urls === null) {
          ctx.addIssue({ code: 'custom', message: 'Expected valid-url-string[]' })
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
        ctx.addIssue({ code: 'custom', message: 'Expected valid-url-string' })
        return z.NEVER
      }
      if (!verifyExtension(url, ctx)) return z.NEVER
      return url
    })
    .pipe(z.string().url())
  return withNullable(withEmptyPreprocessing(inner, allowNull), allowNull)
}

/**
 * Sub-branches of a `repeater` are restricted to leaf/scalar types — no nested
 * `repeater`, `relation`, or `file` (v1 restriction, see types.ts Branch.fields).
 */
const REPEATER_DISALLOWED_SUBTYPES = new Set<BranchType>(['repeater', 'relation', 'file'])

/**
 * Compiles a Zod validation schema for repeater branches, validating arrays of items matching sub-fields.
 * 
 * @param branch - The repeater branch definition.
 * @param options - The resolved validation options.
 * @returns The compiled repeater schema.
 */
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

/** Mapping of branch types to their respective schema compilation functions. */
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

/**
 * Returns the appropriate Zod schema builder for a given branch based on its type.
 * 
 * @param branch - The branch definition.
 * @param options - The resolved validation options.
 * @returns The compiled schema.
 */
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

/** Cache storing compiled Zod schemas for seeds to optimize validation runs. */
const seedSchemaCache = new Map<string, z.ZodObject<Record<string, z.ZodTypeAny>>>()

/**
 * Represents the typesafe structure of a fingerprinted branch for cache key generation.
 */
interface BranchFingerprint {
  /** The branch alias. */
  a: string
  /** The branch type. */
  t: BranchType
  /** The branch format option, or null. */
  f: string | null
  /** Whether the branch accepts multiple values. */
  m: boolean
  /** Whether the branch is required on creation. */
  rc: boolean
  /** Whether the branch is required on update. */
  ru: boolean
  /** Advanced number configuration options, or null. */
  n: NumberFieldOptions | null
  /** Advanced file configuration options, or null. */
  fi: FileFieldOptions | null
  /** Minimum item count constraint (for repeaters), or null. */
  mi: number | null
  /** Maximum item count constraint (for repeaters), or null. */
  ma: number | null
  /** Nested sub-branches fingerprints (for repeaters), or null. */
  sub: BranchFingerprint[] | null
}

/**
 * Recursively generates a typesafe fingerprint object for a branch and its sub-branches.
 * 
 * @param branch - The branch definition.
 * @returns The structured branch fingerprint object.
 */
function buildBranchFingerprint(branch: Branch): BranchFingerprint {
  return {
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
    sub: branch.fields?.map(buildBranchFingerprint) ?? null,
  }
}

/**
 * Generates a unique JSON fingerprint string representing a seed's structure for caching.
 * 
 * @param seed - The seed definition.
 * @returns The fingerprint string.
 */
function buildSeedFingerprint(seed: Seed): string {
  const parts = seed.branches.map(buildBranchFingerprint)
  return JSON.stringify({ s: seed.slug, b: parts })
}

/**
 * Builds a cache key for a seed validation schema combining its fingerprint, operation, and options.
 * 
 * @param seed - The seed definition.
 * @param options - The resolved validation options.
 * @returns The cache key string.
 */
function buildCacheKey(seed: Seed, options: ResolvedOptions): string {
  return [
    buildSeedFingerprint(seed),
    options.operation,
    options.allowNull ? '1' : '0',
    options.enforceRequiredFields ? '1' : '0',
    String(options.maxTextLength),
  ].join('|')
}

/**
 * Compiles or retrieves from cache the full Zod validation schema for a seed structure.
 * 
 * @param seed - The seed definition.
 * @param options - The resolved validation options.
 * @returns The compiled strict Zod object schema.
 */
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

/**
 * Checks if a value is effectively empty (e.g. null, undefined, empty string, empty array, or empty rich text).
 * 
 * @param value - The value to check.
 * @returns True if effectively empty, false otherwise.
 */
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

/**
 * Detects missing or empty required fields based on whether the operation is create or update.
 * 
 * @param seed - The seed definition.
 * @param rawPayload - Raw inputs provided to validation.
 * @param filtered - Payload with unknown aliases stripped.
 * @param parsedData - Parsed and validated data fields.
 * @param parseSucceeded - Whether Zod parsing succeeded.
 * @param options - The resolved validation options.
 * @returns An object containing lists of missing fields and structured validation details.
 */
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

/**
 * Returns a string representing the runtime type of a value for error reporting.
 * 
 * @param value - The value to describe.
 * @returns A string description of the value type (e.g. 'null', 'array', 'string').
 */
function describeReceivedType(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

/**
 * Formats expected error messages based on validation failure details.
 * 
 * @param message - The raw issue message or string.
 * @returns The expected type format string.
 */
function expectedFromMessage(message: unknown): string {
  if (typeof message !== 'string') return 'valid-field-value'
  return message.startsWith('Expected ') ? message.slice('Expected '.length) : 'valid-field-value'
}

/**
 * Separates known fields (present in seed definition) from unknown fields in a raw payload.
 * 
 * @param seed - The seed definition.
 * @param payload - The raw payload.
 * @returns An object with filtered payload, array of unknown keys, and detail issues.
 */
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

/**
 * Recursively flattens Zod union validation issues to report underlying errors.
 * 
 * @param issues - Raw Zod issues.
 * @param parentPath - Path context for nested structures.
 * @returns Flattened array of Zod issues.
 */
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

/**
 * Map Zod issues into structured ValidationDetail objects, identifying dangerous or unknown fields.
 * 
 * @param seed - The seed definition.
 * @param issues - Raw Zod issues.
 * @param filtered - Payload with unknown aliases stripped.
 * @param options - The resolved validation options.
 * @returns Structured details, unknown lists, and dangerous lists.
 */
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

    const expected = expectedFromMessage(issue.message)
    const received = describeReceivedType(filtered[field])
    
    let message = `Field '${field}' expects type '${expected}' but received '${received}'`
    if (received === 'string' && typeof issue.message === 'string' && issue.message.startsWith('Expected ')) {
      if (expected.includes('url') || expected.includes('string') || expected.includes('date') || expected.includes('file')) {
        message = `Field '${field}' has invalid format. Expected '${expected}' but received a non-matching string.`
      }
    }

    details.push({
      field,
      expected,
      received,
      message,
    })
  }

  return { details, unknown, dangerous }
}

// ──────────────────────────────────────────────────────────────────────────────
// Public entry points
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Validates and sanitizes a seed payload against its schema definition.
 * 
 * This is the public entry point for seed payload validation. It strips unknown
 * aliases, coerces types, checks required fields on create/update, checks limits,
 * and performs rich text XSS checks without throwing exceptions.
 * 
 * @param seed - The seed definition containing field/branch definitions.
 * @param payload - The raw payload values to validate and sanitize.
 * @param options - Validation settings to override defaults.
 * @returns A structured validation result containing parsed data, details of any issues, and flags.
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
 * Type-guard validating if a value is a valid content status ('draft', 'review', or 'published').
 * 
 * @param value - The value to check.
 * @returns True if the value is a valid content status, false otherwise.
 */
export function isValidContentStatus(value: unknown): value is (typeof STATUS_VALUES)[number] {
  return statusSchema.safeParse(value).success
}
