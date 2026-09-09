// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { verifyMagicBytes } from '@beechcms/core'
import type { FormFileAttachment } from '../types.js'

/**
 * Result of client-side file magic bytes validation before form upload.
 */
export interface ClientMagicBytesResult {
  /** Whether the file matches its declared MIME signature. */
  valid: boolean
  /** Validation error message if the file is invalid or mismatched. */
  error?: string
}

/**
 * Validates a binary byte array against the declared MIME type using @beechcms/core.
 *
 * @param bytes - The binary data of the file.
 * @param declaredMime - The MIME type reported by the browser File object.
 * @returns An object indicating whether the file signature is valid, with optional error message.
 */
export function verifyClientMagicBytes(bytes: Uint8Array, declaredMime: string): ClientMagicBytesResult {
  const result = verifyMagicBytes(bytes, declaredMime)
  return {
    valid: result.valid,
    error: result.error,
  }
}

/**
 * Encodes a Uint8Array buffer into a standard Base64 string in client/browser environments.
 *
 * @param bytes - The byte array to encode.
 * @returns The Base64 encoded string.
 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Reads a browser File object, verifies its magic bytes signature, and converts it
 * to a FormFileAttachment ready for submission to the BeechCMS Public Form API.
 *
 * @param file - The browser File instance to convert and validate.
 * @returns A promise resolving to the attachment payload and any validation error encountered.
 */
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

  return {
    attachment: {
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      data: bytesToBase64(bytes),
    },
  }
}

