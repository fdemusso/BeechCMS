// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { FormFileAttachment } from '../types.js'

export interface ClientMagicBytesResult {
  valid: boolean
  error?: string
}

export function verifyClientMagicBytes(bytes: Uint8Array, declaredMime: string): ClientMagicBytesResult {
  if (bytes.length < 4) {
    return { valid: false, error: 'File buffer too small for signature inspection' }
  }

  const normalized = declaredMime.split(';')[0].trim().toLowerCase()

  // PDF: %PDF-
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return normalized === 'application/pdf'
      ? { valid: true }
      : { valid: false, error: `Invalid file signature: expected PDF for ${declaredMime}` }
  }

  // PNG
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    return normalized === 'image/png'
      ? { valid: true }
      : { valid: false, error: `Invalid file signature: expected PNG for ${declaredMime}` }
  }

  // JPEG
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    return normalized === 'image/jpeg' || normalized === 'image/jpg'
      ? { valid: true }
      : { valid: false, error: `Invalid file signature: expected JPEG for ${declaredMime}` }
  }

  // GIF
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return normalized === 'image/gif'
      ? { valid: true }
      : { valid: false, error: `Invalid file signature: expected GIF for ${declaredMime}` }
  }

  // WebP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return normalized === 'image/webp'
      ? { valid: true }
      : { valid: false, error: `Invalid file signature: expected WebP for ${declaredMime}` }
  }

  // Fallback for non-binary formats like plaintext/csv
  if (normalized === 'text/plain' || normalized === 'text/csv') {
    return { valid: true }
  }

  return { valid: false, error: `Unsupported or invalid file signature for ${declaredMime}` }
}

export async function fileToAttachment(file: File): Promise<{ attachment: FormFileAttachment; error?: string }> {
  let buffer: ArrayBuffer
  if (typeof file.arrayBuffer === 'function') {
    buffer = await file.arrayBuffer()
  } else if (typeof FileReader !== 'undefined') {
    buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'))
      reader.readAsArrayBuffer(file)
    })
  } else {
    buffer = new ArrayBuffer(0)
  }

  const bytes = new Uint8Array(buffer)
  const validation = verifyClientMagicBytes(bytes, file.type || 'application/octet-stream')
  if (!validation.valid) {
    return {
      attachment: { filename: file.name, mimeType: file.type, data: '' },
      error: validation.error,
    }
  }

  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  const base64 = btoa(binary)

  return {
    attachment: {
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      data: base64,
    },
  }
}
