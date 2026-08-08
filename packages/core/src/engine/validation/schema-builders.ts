// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { z } from 'zod'
import type { Branch, BranchType } from '../types.js'
import type { IIdGenerator } from '../../common/id-generator.js'
import type { ResolvedOptions } from './index.js'
import { extensionFromUrl, isExtensionAccepted } from '../../media/file-types.js'
import { cleanString, stripControlChars, byteLength, isPlainObject } from './primitives.js'
import { sanitizeRichtext } from './richtext-sanitizer.js'
import { resolveFileOptions, isAssetListBranch, collectAssetListItems, extractFileCandidate } from './file-branch.js'

/**
 * Validates if a string is a valid ISO 8601 date.
 *
 * @param value - The date string to validate.
 * @returns True if the string is a valid ISO date, false otherwise.
 */
function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}(?::?\d{2})?)?)?$/.test(value)) {
    return false
  }
  const ts = Date.parse(value)
  if (Number.isNaN(ts)) return false

  const y = parseInt(value.slice(0, 4), 10)
  const m = parseInt(value.slice(5, 7), 10)
  const d = parseInt(value.slice(8, 10), 10)

  const date = new Date(Date.UTC(y, m - 1, d))
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  )
}

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
  const wrapped: z.ZodTypeAny = allowNull ? schema.optional().nullable() : schema.optional()
  return z.preprocess(
    (val) => {
      if (val === '') return fallback
      if (val === null) return allowNull ? null : val
      return val
    },
    wrapped,
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
    .refine((value) => byteLength(value) <= options.maxTextLength, {
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
      const originDecimals = decimalPlaces(origin)
      const scale = 10 ** Math.max(valDecimals, stepDecimals, originDecimals)
      const offset = Math.round((val - origin) * scale)
      const stepScaled = Math.round(step * scale)
      if (stepScaled !== 0 && offset % stepScaled !== 0) {
        ctx.addIssue({ code: 'custom', message: `Expected number(step:${step})` })
      }
    }
  })
  return withEmptyPreprocessing(base, allowNull)
}

/**
 * Compiles a Zod validation schema for a boolean branch.
 *
 * @param allowNull - Whether null values are allowed.
 * @returns The compiled boolean schema.
 */
function booleanSchema(allowNull: boolean): z.ZodTypeAny {
  return withEmptyPreprocessing(z.boolean(), allowNull)
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
  return withEmptyPreprocessing(base, allowNull)
}

/** Max nesting depth accepted when walking a `json` branch value. */
const JSON_MAX_DEPTH = 50
/** Max number of items accepted in a `tags` branch array. */
const MAX_TAGS_COUNT = 100

/**
 * Recursively strips control characters from string leaves while enforcing a
 * depth cap, mirroring the richtext sanitizer's DoS guards for arbitrary JSON.
 *
 * @param value - The value (or sub-value) being walked.
 * @param depth - Current recursion depth.
 * @returns The sanitized value, or `undefined` with `tooDeep: true` if the cap was exceeded.
 */
function sanitizeJsonValue(value: unknown, depth: number): { value: unknown; tooDeep: boolean } {
  if (depth > JSON_MAX_DEPTH) return { value: undefined, tooDeep: true }
  if (typeof value === 'string') return { value: stripControlChars(value), tooDeep: false }
  if (Array.isArray(value)) {
    const out: unknown[] = []
    for (const item of value) {
      const res = sanitizeJsonValue(item, depth + 1)
      if (res.tooDeep) return res
      out.push(res.value)
    }
    return { value: out, tooDeep: false }
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      const res = sanitizeJsonValue(v, depth + 1)
      if (res.tooDeep) return res
      out[k] = res.value
    }
    return { value: out, tooDeep: false }
  }
  return { value, tooDeep: false }
}

/**
 * Compiles a Zod validation schema for a `json` branch, bounding size and nesting
 * depth like richtext, and stripping control characters from string leaves.
 *
 * @param options - The resolved validation options.
 * @param allowNull - Whether null values are allowed.
 * @returns The compiled JSON schema.
 */
function jsonSchema(options: ResolvedOptions, allowNull: boolean): z.ZodTypeAny {
  const base = z
    .union([z.record(z.string(), z.unknown()), z.array(z.unknown())])
    .transform((val, ctx) => {
      // Fail-fast size check before the sanitizing walk, same order as richtext.
      const rawSize = byteLength(JSON.stringify(val))
      if (rawSize > options.maxTextLength) {
        ctx.addIssue({ code: 'custom', message: `Expected json(max:${options.maxTextLength})` })
        return z.NEVER
      }
      const { value, tooDeep } = sanitizeJsonValue(val, 0)
      if (tooDeep) {
        ctx.addIssue({ code: 'custom', message: `Expected json(maxDepth:${JSON_MAX_DEPTH})` })
        return z.NEVER
      }
      return value
    })
  return withEmptyPreprocessing(base, allowNull)
}

/**
 * Compiles a Zod validation schema for a `tags` branch, constraining it to a
 * bounded array of cleaned strings (fixes #183: previously any array/object
 * shape passed, breaking callers like the kanban swap that cast to `string[]`).
 *
 * @param options - The resolved validation options.
 * @param allowNull - Whether null values are allowed.
 * @returns The compiled tags schema.
 */
function tagsSchema(options: ResolvedOptions, allowNull: boolean): z.ZodTypeAny {
  const tagSchema = z
    .string()
    .transform((value) => cleanString(value))
    .refine((value) => byteLength(value) <= options.maxTextLength, {
      message: `Expected string(max:${options.maxTextLength})`,
    })
  const base = z.array(tagSchema).max(MAX_TAGS_COUNT, {
    message: `Expected tags(max:${MAX_TAGS_COUNT})`,
  })
  return withEmptyPreprocessing(base, allowNull)
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
    { message: 'Expected valid-relation-id' },
  )
  // Many-to-many: expect string[] with no duplicates
  if (branch.multiple === true) {
    const arraySchema = z.array(idSchema).refine(
      (arr) => new Set(arr).size === arr.length,
      { message: 'Expected unique-relation-ids' },
    )
    return withEmptyPreprocessing(arraySchema, options.allowNull)
  }
  return withEmptyPreprocessing(idSchema, options.allowNull)
}

/**
 * Compiles a Zod validation schema for file or asset list branches.
 *
 * @param branch - The file branch definition.
 * @param allowNull - Whether null values are allowed.
 * @returns The compiled file schema.
 */
function fileSchema(branch: Branch, allowNull: boolean): z.ZodTypeAny {
  const { accept, maxSize } = resolveFileOptions(branch)
  const verifyExtension = (url: string, ctx: z.RefinementCtx): boolean => {
    if (accept === 'any') return true
    const ext = extensionFromUrl(url)
    if (isExtensionAccepted(ext, accept)) return true
    ctx.addIssue({ code: 'custom', message: `Expected valid-${accept}-url-with-extension` })
    return false
  }
  const verifySize = (size: number | null, ctx: z.RefinementCtx): boolean => {
    if (size === null || size <= maxSize) return true
    ctx.addIssue({ code: 'custom', message: `Expected file(maxSize:${maxSize})` })
    return false
  }

  if (isAssetListBranch(branch)) {
    const inner = z
      .any()
      .transform((raw, ctx) => {
        const items = collectAssetListItems(raw)
        if (items === null) {
          ctx.addIssue({ code: 'custom', message: 'Expected valid-url-string[]' })
          return z.NEVER
        }
        for (const item of items) {
          if (!verifyExtension(item.url, ctx)) return z.NEVER
          if (!verifySize(item.size, ctx)) return z.NEVER
        }
        return items.map((item) => item.url)
      })
      .pipe(z.array(z.url()))
    return withEmptyPreprocessing(inner, allowNull)
  }

  const inner = z
    .any()
    .transform((raw, ctx) => {
      const candidate = extractFileCandidate(raw)
      if (!candidate) {
        ctx.addIssue({ code: 'custom', message: 'Expected valid-url-string' })
        return z.NEVER
      }
      if (!verifyExtension(candidate.url, ctx)) return z.NEVER
      if (!verifySize(candidate.size, ctx)) return z.NEVER
      return candidate.url
    })
    .pipe(z.url())
  return withEmptyPreprocessing(inner, allowNull)
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
    const isRequired = options.enforceRequiredFields && sub[requiredFlag]
    shape[sub.alias] = isRequired ? subSchema : subSchema.optional()
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
  return withEmptyPreprocessing(arraySchema, options.allowNull)
}

/** Mapping of branch types to their respective schema compilation functions. */
const BRANCH_SCHEMA_BUILDERS: Record<string, (branch: Branch, options: ResolvedOptions) => z.ZodTypeAny> = {
  text: (_branch, options) => textSchema(options, options.allowNull),
  richtext: (_branch, options) => richtextSchema(options, options.allowNull),
  number: (branch, options) => numberSchema(branch, options.allowNull),
  boolean: (_branch, options) => booleanSchema(options.allowNull),
  date: (_branch, options) => dateSchema(options.allowNull),
  json: (_branch, options) => jsonSchema(options, options.allowNull),
  tags: (_branch, options) => tagsSchema(options, options.allowNull),
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
export function schemaForBranch(branch: Branch, options: ResolvedOptions): z.ZodTypeAny {
  const builder = BRANCH_SCHEMA_BUILDERS[branch.type]
  if (!builder) {
    throw new Error(`Unhandled branch type: ${(branch as { type: string }).type}`)
  }
  return builder(branch, options)
}
