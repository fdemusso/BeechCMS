// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { Branch } from '../types.js'
import type { FileAccept } from '../../media/file-types.js'
import { cleanString, isPlainObject } from './primitives.js'

/** Default maximum file size in bytes for file branches. */
const DEFAULT_FILE_MAX_SIZE = 5 * 1024 * 1024

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
export function parseHttpUrl(input: unknown): string | null {
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
export function isAssetListBranch(branch: Branch): boolean {
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
 * Extracts a byte size from a candidate value's `size` field, if present and valid.
 *
 * @param candidate - The candidate value.
 * @returns The size in bytes, or null if not available.
 */
function extractSizeFromCandidate(candidate: unknown): number | null {
  if (!isPlainObject(candidate)) return null
  const raw = candidate.size
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : null
}

/** A file URL paired with its byte size, when known from payload metadata. */
export interface FileCandidate {
  url: string
  size: number | null
}

/**
 * Extracts a URL and, when available, a byte size from a candidate value
 * (a string URL, or an object with `url`/`size` fields, e.g. uploader output).
 *
 * @param candidate - The candidate value.
 * @returns The extracted file candidate, or null if no valid URL was found.
 */
export function extractFileCandidate(candidate: unknown): FileCandidate | null {
  const url = extractUrlFromCandidate(candidate)
  if (!url) return null
  return { url, size: extractSizeFromCandidate(candidate) }
}

/**
 * Collects and deduplicates valid file candidates (url + optional size) from a raw
 * input representing an asset list.
 *
 * @param raw - The raw input data (can be array, JSON string, or single item).
 * @returns The list of unique file candidates, or null if any item is invalid.
 */
export function collectAssetListItems(raw: unknown): FileCandidate[] | null {
  const source = typeof raw === 'string' ? tryParseJson(raw) : raw
  const items = Array.isArray(source) ? source : [source]
  const seen = new Set<string>()
  const out: FileCandidate[] = []
  for (const item of items) {
    if (item === null || item === undefined) continue
    const candidate = extractFileCandidate(item)
    if (!candidate) return null
    if (!seen.has(candidate.url)) {
      seen.add(candidate.url)
      out.push(candidate)
    }
  }
  return out
}
