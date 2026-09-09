// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import {
  SUPPORTED_FILE_TYPES,
  getFileTypeByMime,
  BLOCKED_IMAGE_MIME_TYPES,
  matchesFileSignature,
  type FileTypeDefinition,
} from './file-types.js'

/**
 * Result of a file magic bytes signature validation.
 */
export interface MagicBytesValidationResult {
  /** Whether the byte buffer matches the declared format signature. */
  valid: boolean
  /** Detected canonical primary MIME type if valid or identified. */
  detectedMime?: string
  /** Human-readable error description when validation fails. */
  error?: string
}

/**
 * Iterates across supported binary definitions to find any matching file signature.
 *
 * @param bytes - The raw byte buffer to analyze.
 * @returns The matching FileTypeDefinition if recognized, or undefined.
 */
function detectBinaryType(bytes: Uint8Array): FileTypeDefinition | undefined {
  for (const def of Object.values(SUPPORTED_FILE_TYPES)) {
    if (def.isBinary && matchesFileSignature(def, bytes)) {
      return def
    }
  }
  return undefined
}

/**
 * Validates that an uploaded file's binary content matches its declared MIME type,
 * protecting against MIME-spoofing, disguised executables, and blocked formats (e.g. SVG).
 *
 * @param buffer - The raw binary buffer (ArrayBuffer or Uint8Array).
 * @param declaredMime - The client-declared MIME type string.
 * @returns A MagicBytesValidationResult indicating validity and details.
 */
export function verifyMagicBytes(
  buffer: ArrayBuffer | Uint8Array,
  declaredMime: string
): MagicBytesValidationResult {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  if (bytes.length < 2) {
    return { valid: false, error: 'File buffer too small for signature inspection' }
  }

  const normalizedDeclared = declaredMime.split(';')[0].trim().toLowerCase()

  // Unconditionally reject blocked MIME types (e.g. SVG)
  if (BLOCKED_IMAGE_MIME_TYPES.includes(normalizedDeclared)) {
    return {
      valid: false,
      error: `File type '${declaredMime}' is blocked for security reasons`,
    }
  }

  const declaredDef = getFileTypeByMime(normalizedDeclared)
  if (!declaredDef) {
    return { valid: false, error: `Unrecognized file signature for declared MIME ${declaredMime}` }
  }

  // Non-binary types (e.g. text/plain, text/csv, text/markdown, application/json)
  if (!declaredDef.isBinary) {
    return { valid: true, detectedMime: declaredDef.primaryMime }
  }

  // If buffer is smaller than the minimum bytes needed for initial signature inspection (typically 4, or 2-3 for short signatures)
  const minInspectionLength = Math.min(4, declaredDef.magicBytes?.length ?? 4)
  if (bytes.length < minInspectionLength) {
    return { valid: false, error: 'File buffer too small for signature inspection' }
  }

  // Binary types: verify signature against declared definition
  if (matchesFileSignature(declaredDef, bytes)) {
    return { valid: true, detectedMime: declaredDef.primaryMime }
  }

  // Signature mismatch: check if it matches another known binary signature
  const detectedDef = detectBinaryType(bytes)
  if (detectedDef) {
    return {
      valid: false,
      detectedMime: detectedDef.primaryMime,
      error: `Signature mismatch: file is ${detectedDef.extension.toUpperCase()} but declared as ${declaredMime}`,
    }
  }

  return { valid: false, error: `Unrecognized file signature for declared MIME ${declaredMime}` }
}


