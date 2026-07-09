// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { z } from 'zod'
import type { Seed } from '../types.js'
import type { IIdGenerator } from '../../common/id-generator.js'
import { isRichtextEnvelopeV1 } from '../../content/richtext/richtext.js'
import { cleanString, isPlainObject } from './primitives.js'
import { isRichtextDocEmpty } from './richtext-sanitizer.js'
import { compileSeedSchema } from './cache.js'

// Re-export the public file-branch symbol so the barrel surface stays complete.
export { resolveFileOptions } from './file-branch.js'

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
export type ResolvedOptions = {
  allowNull: boolean
  operation: 'create' | 'update'
  requireAtLeastOneValidField: boolean
  enforceRequiredFields: boolean
  maxTextLength: number
  idGenerator: IIdGenerator | undefined
}

/** Default maximum character length allowed for text and rich text branches. */
const DEFAULT_MAX_TEXT_LENGTH = 50_000

/** Set of valid content status values. */
const STATUS_VALUES = ['draft', 'review', 'published'] as const
/** Zod schema for content status enum validation. */
const statusSchema = z.enum(STATUS_VALUES)

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
 * Builds a dotted/bracketed field path from a Zod issue path (e.g. 'items[0].name').
 *
 * @param path - Zod issue path segments.
 * @returns The full field path as a string, or 'payload' if the path is empty.
 */
function buildFieldPath(path: (string | number)[]): string {
  if (path.length === 0) return 'payload'
  return path.reduce<string>((result, segment, index) => {
    if (index === 0) return String(segment)
    return typeof segment === 'number' ? `${result}[${segment}]` : `${result}.${String(segment)}`
  }, '')
}

/**
 * Navigates a payload object by a Zod issue path to find the actual value that failed validation.
 *
 * @param filtered - Payload with unknown aliases stripped.
 * @param path - Zod issue path segments.
 * @returns The value found at the path, or undefined if unreachable.
 */
function resolveByPath(filtered: Record<string, unknown>, path: (string | number)[]): unknown {
  let current: unknown = filtered
  for (const segment of path) {
    if (current === null || current === undefined) return current
    if (typeof segment === 'number') {
      if (!Array.isArray(current)) return undefined
      current = current[segment]
    } else {
      if (typeof current !== 'object') return undefined
      current = (current as Record<string, unknown>)[segment]
    }
  }
  return current
}

/**
 * Formats expected error messages based on validation failure details.
 *
 * Zod v4 native `invalid_type` issues carry the expected type on `issue.expected`
 * directly. Custom `.refine`/`ctx.addIssue` checks in this codebase still encode
 * it as an `"Expected <type>"` message prefix, so that convention is kept as a fallback.
 *
 * @param issue - The Zod issue to derive the expected type from.
 * @returns The expected type format string.
 */
function expectedFromIssue(issue: z.ZodIssue): string {
  if (issue.code === 'invalid_type') return issue.expected
  const message = issue.message
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
      const unionErrors = (issue as { errors: z.ZodIssue[][] }).errors
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

    const issuePath = issue.path as (string | number)[]

    // detectMissingRequired() already reports top-level required-and-missing branches;
    // skip the redundant native invalid_type/undefined issue Zod v4 raises for the same field.
    if (
      issue.code === 'invalid_type' &&
      options.enforceRequiredFields &&
      issuePath.length === 1 &&
      resolveByPath(filtered, issuePath) === undefined
    ) {
      continue
    }

    const field = buildFieldPath(issuePath)
    const params = (issue as { params?: Record<string, unknown> }).params
    if (params?.dangerous === true) {
      dangerous.push(field)
    }

    const expected = expectedFromIssue(issue)
    const received = describeReceivedType(resolveByPath(filtered, issuePath))

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
