// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export interface MagicBytesValidationResult {
  valid: boolean
  detectedMime?: string
  error?: string
}

export function verifyMagicBytes(
  buffer: ArrayBuffer | Uint8Array,
  declaredMime: string
): MagicBytesValidationResult {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  if (bytes.length < 4) {
    return { valid: false, error: 'File buffer too small for signature inspection' }
  }

  const normalizedDeclared = declaredMime.split(';')[0].trim().toLowerCase()

  // PDF: %PDF- (0x25 0x50 0x44 0x46)
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return normalizedDeclared === 'application/pdf'
      ? { valid: true, detectedMime: 'application/pdf' }
      : { valid: false, detectedMime: 'application/pdf', error: `Signature mismatch: file is PDF but declared as ${declaredMime}` }
  }

  // PNG: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47 &&
    bytes[4] === 0x0D && bytes[5] === 0x0A && bytes[6] === 0x1A && bytes[7] === 0x0A
  ) {
    return normalizedDeclared === 'image/png'
      ? { valid: true, detectedMime: 'image/png' }
      : { valid: false, detectedMime: 'image/png', error: `Signature mismatch: file is PNG but declared as ${declaredMime}` }
  }

  // JPEG: 0xFF 0xD8 0xFF
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    return normalizedDeclared === 'image/jpeg' || normalizedDeclared === 'image/jpg'
      ? { valid: true, detectedMime: 'image/jpeg' }
      : { valid: false, detectedMime: 'image/jpeg', error: `Signature mismatch: file is JPEG but declared as ${declaredMime}` }
  }

  // GIF: GIF87a or GIF89a (0x47 0x49 0x46 0x38)
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return normalizedDeclared === 'image/gif'
      ? { valid: true, detectedMime: 'image/gif' }
      : { valid: false, detectedMime: 'image/gif', error: `Signature mismatch: file is GIF but declared as ${declaredMime}` }
  }

  // WebP: RIFF....WEBP (0x52 0x49 0x46 0x46 ... 0x57 0x45 0x42 0x50)
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return normalizedDeclared === 'image/webp'
      ? { valid: true, detectedMime: 'image/webp' }
      : { valid: false, detectedMime: 'image/webp', error: `Signature mismatch: file is WebP but declared as ${declaredMime}` }
  }

  // Allow text/plain and other non-binary types without strict magic bytes if declared
  if (normalizedDeclared === 'text/plain' || normalizedDeclared === 'text/csv') {
    return { valid: true, detectedMime: normalizedDeclared }
  }

  return { valid: false, error: `Unrecognized file signature for declared MIME ${declaredMime}` }
}
