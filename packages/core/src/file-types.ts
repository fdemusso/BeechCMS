export type FileAccept = 'image' | 'document' | 'any'

export const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico'])
export const DOCUMENT_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'md'])
export const ARCHIVE_EXTENSIONS = new Set(['zip', '7z', 'tar', 'gz', 'json'])

export const IMAGE_MIME_PREFIXES = ['image/'] as const
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
  if (accept === 'any') {
    return IMAGE_MIME_PREFIXES.some((p) => mime.startsWith(p))
      || (DOCUMENT_MIME_TYPES as readonly string[]).includes(mime)
      || (ARCHIVE_MIME_TYPES as readonly string[]).includes(mime)
  }
  if (accept === 'image') return IMAGE_MIME_PREFIXES.some((p) => mime.startsWith(p))
  if (accept === 'document') return (DOCUMENT_MIME_TYPES as readonly string[]).includes(mime)
  return false
}
