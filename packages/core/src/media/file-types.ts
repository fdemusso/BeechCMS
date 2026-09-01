// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * File acceptance filter categories used by branch schemas and forms.
 */
export type FileAccept = 'image' | 'document' | 'any'

/**
 * High-level categorization of supported file types.
 */
export type FileCategory = 'image' | 'document' | 'archive'

/**
 * Definition of a supported file format in BeechCMS, including MIME types,
 * binary classification, and binary signature verification rules.
 */
export interface FileTypeDefinition {
  /** File extension without leading dot (e.g. 'jpg', 'png', 'pdf'). */
  readonly extension: string
  /** Canonical primary MIME type (e.g. 'image/jpeg'). */
  readonly primaryMime: string
  /** All valid MIME types associated with this format. */
  readonly mimeTypes: readonly string[]
  /** High-level file category. */
  readonly category: FileCategory
  /** Whether the file is a binary format requiring magic byte signature validation. */
  readonly isBinary: boolean
  /** Expected magic bytes prefix if the format uses a static prefix. */
  readonly magicBytes?: readonly number[]
  /** Custom signature matching function for formats with complex, variable, or offset headers. */
  readonly matchSignature?: (bytes: Uint8Array) => boolean
}

/**
 * Checks whether a byte buffer starts with a specified byte prefix.
 *
 * @param bytes - The byte buffer to inspect.
 * @param prefix - The sequence of bytes to match against.
 * @returns True if the buffer starts with the given prefix, false otherwise.
 */
export function matchBytePrefix(bytes: Uint8Array, prefix: readonly number[]): boolean {
  if (bytes.length < prefix.length) return false
  for (let i = 0; i < prefix.length; i++) {
    if (bytes[i] !== prefix[i]) return false
  }
  return true
}

/**
 * Evaluates whether the given byte buffer matches the binary signature of a file definition.
 *
 * @param def - The file type definition to check against.
 * @param bytes - The raw byte buffer to inspect.
 * @returns True if the bytes match the definition's signature rules, false otherwise.
 */
export function matchesFileSignature(def: FileTypeDefinition, bytes: Uint8Array): boolean {
  if (!def.isBinary) return true
  if (def.matchSignature) return def.matchSignature(bytes)
  if (def.magicBytes) return matchBytePrefix(bytes, def.magicBytes)
  return false
}

/** OLE Compound File Binary Format (CFBF) header used by legacy MS Office files (.doc, .xls, .ppt). */
const OLE_MAGIC = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1] as const

/** Matcher for OLE CFBF binary files. */
function matchOleSignature(bytes: Uint8Array): boolean {
  return matchBytePrefix(bytes, OLE_MAGIC)
}

/** Standard ZIP header matcher used by .zip and Office OpenXML (.docx, .xlsx, .pptx). */
function matchZipSignature(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false
  return (
    (bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04) || // standard zip
    (bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x05 && bytes[3] === 0x06) || // empty zip
    (bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x07 && bytes[3] === 0x08)    // spanned zip
  )
}

/** Common shared definition for JPEG files. */
const JPEG_DEFINITION: Omit<FileTypeDefinition, 'extension'> = {
  primaryMime: 'image/jpeg',
  mimeTypes: ['image/jpeg', 'image/jpg'],
  category: 'image',
  isBinary: true,
  magicBytes: [0xFF, 0xD8, 0xFF],
}

/** Common shared definition for legacy MS Office files. */
const OLE_DOCUMENT_DEFINITION = {
  category: 'document' as const,
  isBinary: true,
  magicBytes: [...OLE_MAGIC],
  matchSignature: matchOleSignature,
}

/** Common shared definition for OpenXML Office files. */
const OPENXML_DOCUMENT_DEFINITION = {
  category: 'document' as const,
  isBinary: true,
  magicBytes: [0x50, 0x4B, 0x03, 0x04],
  matchSignature: matchZipSignature,
}

/**
 * Single source of truth registry for all supported file types in BeechCMS.
 */
export const SUPPORTED_FILE_TYPES: Record<string, FileTypeDefinition> = {
  // --- IMAGES ---
  jpg: {
    extension: 'jpg',
    ...JPEG_DEFINITION,
  },
  jpeg: {
    extension: 'jpeg',
    ...JPEG_DEFINITION,
  },
  png: {
    extension: 'png',
    primaryMime: 'image/png',
    mimeTypes: ['image/png'],
    category: 'image',
    isBinary: true,
    magicBytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
  },
  gif: {
    extension: 'gif',
    primaryMime: 'image/gif',
    mimeTypes: ['image/gif'],
    category: 'image',
    isBinary: true,
    magicBytes: [0x47, 0x49, 0x46, 0x38],
    matchSignature: (bytes) =>
      bytes.length >= 6 &&
      bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 &&
      (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61,
  },
  webp: {
    extension: 'webp',
    primaryMime: 'image/webp',
    mimeTypes: ['image/webp'],
    category: 'image',
    isBinary: true,
    magicBytes: [0x52, 0x49, 0x46, 0x46],
    matchSignature: (bytes) =>
      bytes.length >= 12 &&
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50,
  },
  avif: {
    extension: 'avif',
    primaryMime: 'image/avif',
    mimeTypes: ['image/avif'],
    category: 'image',
    isBinary: true,
    magicBytes: [0x66, 0x74, 0x79, 0x70],
    matchSignature: (bytes) => {
      if (bytes.length < 12) return false
      // Check for 'ftyp' at offset 4
      const isFtyp = bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70
      if (!isFtyp) return false
      // Brand check: 'avif', 'avis', 'mif1', 'msf1'
      const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11])
      return brand === 'avif' || brand === 'avis' || brand === 'mif1' || brand === 'msf1'
    },
  },
  bmp: {
    extension: 'bmp',
    primaryMime: 'image/bmp',
    mimeTypes: ['image/bmp'],
    category: 'image',
    isBinary: true,
    magicBytes: [0x42, 0x4D],
  },
  ico: {
    extension: 'ico',
    primaryMime: 'image/x-icon',
    mimeTypes: ['image/x-icon', 'image/vnd.microsoft.icon'],
    category: 'image',
    isBinary: true,
    magicBytes: [0x00, 0x00, 0x01, 0x00],
  },

  // --- DOCUMENTS ---
  pdf: {
    extension: 'pdf',
    primaryMime: 'application/pdf',
    mimeTypes: ['application/pdf'],
    category: 'document',
    isBinary: true,
    magicBytes: [0x25, 0x50, 0x44, 0x46],
  },
  docx: {
    extension: 'docx',
    primaryMime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ...OPENXML_DOCUMENT_DEFINITION,
  },
  doc: {
    extension: 'doc',
    primaryMime: 'application/msword',
    mimeTypes: ['application/msword'],
    ...OLE_DOCUMENT_DEFINITION,
  },
  xlsx: {
    extension: 'xlsx',
    primaryMime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    mimeTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ...OPENXML_DOCUMENT_DEFINITION,
  },
  xls: {
    extension: 'xls',
    primaryMime: 'application/vnd.ms-excel',
    mimeTypes: ['application/vnd.ms-excel'],
    ...OLE_DOCUMENT_DEFINITION,
  },
  pptx: {
    extension: 'pptx',
    primaryMime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    mimeTypes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    ...OPENXML_DOCUMENT_DEFINITION,
  },
  ppt: {
    extension: 'ppt',
    primaryMime: 'application/vnd.ms-powerpoint',
    mimeTypes: ['application/vnd.ms-powerpoint'],
    ...OLE_DOCUMENT_DEFINITION,
  },
  txt: {
    extension: 'txt',
    primaryMime: 'text/plain',
    mimeTypes: ['text/plain'],
    category: 'document',
    isBinary: false,
  },
  csv: {
    extension: 'csv',
    primaryMime: 'text/csv',
    mimeTypes: ['text/csv'],
    category: 'document',
    isBinary: false,
  },
  md: {
    extension: 'md',
    primaryMime: 'text/markdown',
    mimeTypes: ['text/markdown'],
    category: 'document',
    isBinary: false,
  },

  // --- ARCHIVES & DATA ---
  zip: {
    extension: 'zip',
    primaryMime: 'application/zip',
    mimeTypes: ['application/zip', 'application/x-zip-compressed'],
    category: 'archive',
    isBinary: true,
    magicBytes: [0x50, 0x4B, 0x03, 0x04],
    matchSignature: matchZipSignature,
  },
  '7z': {
    extension: '7z',
    primaryMime: 'application/x-7z-compressed',
    mimeTypes: ['application/x-7z-compressed'],
    category: 'archive',
    isBinary: true,
    magicBytes: [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C],
  },
  tar: {
    extension: 'tar',
    primaryMime: 'application/x-tar',
    mimeTypes: ['application/x-tar'],
    category: 'archive',
    isBinary: true,
    magicBytes: [0x75, 0x73, 0x74, 0x61, 0x72], // 'ustar'
    matchSignature: (bytes) => {
      if (bytes.length < 512) return false
      // Check for POSIX 'ustar' at offset 257
      return (
        bytes[257] === 0x75 && bytes[258] === 0x73 && bytes[259] === 0x74 &&
        bytes[260] === 0x61 && bytes[261] === 0x72
      )
    },
  },
  gz: {
    extension: 'gz',
    primaryMime: 'application/gzip',
    mimeTypes: ['application/gzip'],
    category: 'archive',
    isBinary: true,
    magicBytes: [0x1F, 0x8B],
  },
  json: {
    extension: 'json',
    primaryMime: 'application/json',
    mimeTypes: ['application/json'],
    category: 'archive',
    isBinary: false,
  },
}

/**
 * SVG is intentionally blocked from general file upload as it can embed executable scripts
 * creating a stored XSS vulnerability when served directly to browsers.
 */
export const BLOCKED_IMAGE_EXTENSIONS: ReadonlySet<string> = new Set(['svg', 'svgz'])

/**
 * Blocked MIME types associated with unsafe image formats.
 */
export const BLOCKED_IMAGE_MIME_TYPES: readonly string[] = ['image/svg+xml', 'image/svg']

const BLOCKED_IMAGE_MIME_SET: ReadonlySet<string> = new Set(BLOCKED_IMAGE_MIME_TYPES)

/** Set of supported image file extensions. */
export const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set(
  Object.values(SUPPORTED_FILE_TYPES).filter((def) => def.category === 'image').map((def) => def.extension)
)

/** Set of supported document file extensions. */
export const DOCUMENT_EXTENSIONS: ReadonlySet<string> = new Set(
  Object.values(SUPPORTED_FILE_TYPES).filter((def) => def.category === 'document').map((def) => def.extension)
)

/** Set of supported archive file extensions. */
export const ARCHIVE_EXTENSIONS: ReadonlySet<string> = new Set(
  Object.values(SUPPORTED_FILE_TYPES).filter((def) => def.category === 'archive').map((def) => def.extension)
)

/** List of supported image MIME types. */
export const IMAGE_MIME_TYPES: readonly string[] = Array.from(
  new Set(Object.values(SUPPORTED_FILE_TYPES).filter((def) => def.category === 'image').flatMap((def) => def.mimeTypes))
)

/** List of supported document MIME types. */
export const DOCUMENT_MIME_TYPES: readonly string[] = Array.from(
  new Set(Object.values(SUPPORTED_FILE_TYPES).filter((def) => def.category === 'document').flatMap((def) => def.mimeTypes))
)

/** List of supported archive MIME types. */
export const ARCHIVE_MIME_TYPES: readonly string[] = Array.from(
  new Set(Object.values(SUPPORTED_FILE_TYPES).filter((def) => def.category === 'archive').flatMap((def) => def.mimeTypes))
)

const IMAGE_MIME_SET: ReadonlySet<string> = new Set(IMAGE_MIME_TYPES)
const DOCUMENT_MIME_SET: ReadonlySet<string> = new Set(DOCUMENT_MIME_TYPES)
const ARCHIVE_MIME_SET: ReadonlySet<string> = new Set(ARCHIVE_MIME_TYPES)

/**
 * Look up a supported file type definition by its extension.
 *
 * @param ext - The extension string with or without leading dot.
 * @returns The matching FileTypeDefinition, or undefined if unsupported.
 */
export function getFileTypeByExtension(ext: string | null | undefined): FileTypeDefinition | undefined {
  if (!ext) return undefined
  const normalised = ext.replace(/^\./, '').toLowerCase().trim()
  return SUPPORTED_FILE_TYPES[normalised]
}

/**
 * Look up a supported file type definition by its declared MIME type.
 *
 * @param mime - The MIME string (e.g. 'image/png' or 'image/jpeg; charset=utf-8').
 * @returns The matching FileTypeDefinition, or undefined if unsupported.
 */
export function getFileTypeByMime(mime: string | null | undefined): FileTypeDefinition | undefined {
  if (!mime) return undefined
  const normalised = mime.split(';')[0].trim().toLowerCase()
  return Object.values(SUPPORTED_FILE_TYPES).find((def) =>
    def.mimeTypes.some((m) => m.toLowerCase() === normalised)
  )
}

/**
 * Extracts a lowercase file extension from a URL string or query parameters.
 *
 * @param url - The URL string to parse.
 * @returns The extracted extension, or null if none was found.
 */
export function extensionFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname
    const dot = path.lastIndexOf('.')
    if (dot >= 0 && dot < path.length - 1) {
      return path.slice(dot + 1).toLowerCase()
    }
    const param = parsed.searchParams.get('fm') || parsed.searchParams.get('format') || parsed.searchParams.get('ext')
    if (param && /^[a-z0-9]+$/i.test(param)) {
      return param.toLowerCase()
    }
    return null
  } catch {
    return null
  }
}

/**
 * Checks whether a given file extension satisfies an acceptance policy ('image' | 'document' | 'any').
 *
 * @param ext - The file extension.
 * @param accept - The acceptance mode.
 * @returns True if accepted, false otherwise.
 */
export function isExtensionAccepted(ext: string | null | undefined, accept: FileAccept): boolean {
  if (accept === 'any') return true
  if (ext != null && BLOCKED_IMAGE_EXTENSIONS.has(ext)) return false
  if (ext == null) return true
  if (accept === 'image') return IMAGE_EXTENSIONS.has(ext)
  if (accept === 'document') return DOCUMENT_EXTENSIONS.has(ext)
  return false
}

/**
 * Checks whether a given MIME type satisfies an acceptance policy ('image' | 'document' | 'any').
 *
 * @param mime - The declared MIME string.
 * @param accept - The acceptance mode.
 * @returns True if accepted, false otherwise.
 */
export function isMimeAccepted(mime: string, accept: FileAccept): boolean {
  const normalised = mime.split(';')[0].trim().toLowerCase()
  if (BLOCKED_IMAGE_MIME_SET.has(normalised)) return false
  if (accept === 'any') {
    return IMAGE_MIME_SET.has(normalised) || DOCUMENT_MIME_SET.has(normalised) || ARCHIVE_MIME_SET.has(normalised)
  }
  if (accept === 'image') return IMAGE_MIME_SET.has(normalised)
  if (accept === 'document') return DOCUMENT_MIME_SET.has(normalised)
  return false
}
