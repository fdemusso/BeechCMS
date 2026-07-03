// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export type FileAccept = 'image' | 'document' | 'any'

// SVG is intentionally excluded: SVG can embed <script> tags and is rendered
// inline by browsers when served as image/svg+xml on a same-origin route,
// creating a stored XSS vector (see security audit finding #4).
export const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'ico'])
export const BLOCKED_IMAGE_EXTENSIONS = new Set(['svg', 'svgz'])
export const DOCUMENT_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'md'])
export const ARCHIVE_EXTENSIONS = new Set(['zip', '7z', 'tar', 'gz', 'json'])

// Explicitly enumerate safe image MIME types instead of using the wildcard
// `image/*` prefix, which would permit `image/svg+xml` and other XSS vectors.
export const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
  'image/x-icon',
  'image/vnd.microsoft.icon',
] as const
// Blocked image MIME types — listed explicitly so upload code can reject them
// with a clear error rather than a generic "file type not allowed".
export const BLOCKED_IMAGE_MIME_TYPES = ['image/svg+xml', 'image/svg'] as const
export const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'text/markdown',
] as const
export const ARCHIVE_MIME_TYPES = [
  'application/zip',
  'application/x-zip-compressed',
  'application/x-7z-compressed',
  'application/x-tar',
  'application/gzip',
  'application/json',
] as const

export function extensionFromUrl(url: string): string | null {
  try {
    const path = new URL(url).pathname
    const dot = path.lastIndexOf('.')
    if (dot < 0 || dot === path.length - 1) return null
    return path.slice(dot + 1).toLowerCase()
  } catch {
    return null
  }
}

export function isExtensionAccepted(ext: string | null, accept: FileAccept): boolean {
  if (accept === 'any') return true
  if (ext == null) return false
  if (accept === 'image') return IMAGE_EXTENSIONS.has(ext)
  if (accept === 'document') return DOCUMENT_EXTENSIONS.has(ext)
  return false
}

export function isMimeAccepted(mime: string, accept: FileAccept): boolean {
  // Normalise: strip parameters (e.g. "image/jpeg; charset=utf-8" → "image/jpeg")
  const normalised = mime.split(';')[0].trim().toLowerCase()
  // Unconditionally reject SVG regardless of accept mode — SVG can carry
  // embedded scripts and is rendered by browsers when served inline.
  if ((BLOCKED_IMAGE_MIME_TYPES as readonly string[]).includes(normalised)) return false
  if (accept === 'any') {
    return (IMAGE_MIME_TYPES as readonly string[]).includes(normalised)
      || (DOCUMENT_MIME_TYPES as readonly string[]).includes(normalised)
      || (ARCHIVE_MIME_TYPES as readonly string[]).includes(normalised)
  }
  if (accept === 'image') return (IMAGE_MIME_TYPES as readonly string[]).includes(normalised)
  if (accept === 'document') return (DOCUMENT_MIME_TYPES as readonly string[]).includes(normalised)
  return false
}
