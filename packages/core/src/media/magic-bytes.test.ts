// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { verifyMagicBytes } from './magic-bytes.js'
import { SUPPORTED_FILE_TYPES, extensionFromUrl, getFileTypeByExtension, getFileTypeByMime } from './file-types.js'

describe('verifyMagicBytes & File Types Registry', () => {
  it('exposes SUPPORTED_FILE_TYPES registry with all key-value mappings', () => {
    expect(SUPPORTED_FILE_TYPES.pdf).toBeDefined()
    expect(SUPPORTED_FILE_TYPES.pdf.extension).toBe('pdf')
    expect(SUPPORTED_FILE_TYPES.pdf.magicBytes).toEqual([0x25, 0x50, 0x44, 0x46])
    expect(getFileTypeByExtension('pdf')?.extension).toBe('pdf')
    expect(getFileTypeByExtension('.docx')?.extension).toBe('docx')
    expect(getFileTypeByMime('application/pdf')?.extension).toBe('pdf')
  })

  describe('Images', () => {
    it('validates PNG signature', () => {
      const pngBytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00])
      const res = verifyMagicBytes(pngBytes, 'image/png')
      expect(res.valid).toBe(true)
      expect(res.detectedMime).toBe('image/png')
    })

    it('validates JPEG signature', () => {
      const jpegBytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10])
      const res = verifyMagicBytes(jpegBytes, 'image/jpeg')
      expect(res.valid).toBe(true)
      expect(res.detectedMime).toBe('image/jpeg')
    })

    it('validates GIF signature (GIF89a / GIF87a)', () => {
      const gif89Bytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
      expect(verifyMagicBytes(gif89Bytes, 'image/gif').valid).toBe(true)
      const gif87Bytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x37, 0x61])
      expect(verifyMagicBytes(gif87Bytes, 'image/gif').valid).toBe(true)
    })

    it('validates WebP signature', () => {
      const webpBytes = new Uint8Array([
        0x52, 0x49, 0x46, 0x46,
        0x20, 0x00, 0x00, 0x00,
        0x57, 0x45, 0x42, 0x50,
        0x56, 0x50, 0x38, 0x20,
      ])
      const res = verifyMagicBytes(webpBytes, 'image/webp')
      expect(res.valid).toBe(true)
      expect(res.detectedMime).toBe('image/webp')
    })

    it('validates AVIF signature', () => {
      // Offset 4: 'ftyp', Offset 8: 'avif'
      const avifBytes = new Uint8Array([
        0x00, 0x00, 0x00, 0x1C,
        0x66, 0x74, 0x79, 0x70,
        0x61, 0x76, 0x69, 0x66,
      ])
      const res = verifyMagicBytes(avifBytes, 'image/avif')
      expect(res.valid).toBe(true)
      expect(res.detectedMime).toBe('image/avif')
    })

    it('validates BMP signature', () => {
      const bmpBytes = new Uint8Array([0x42, 0x4D, 0x36, 0x00, 0x00, 0x00])
      const res = verifyMagicBytes(bmpBytes, 'image/bmp')
      expect(res.valid).toBe(true)
      expect(res.detectedMime).toBe('image/bmp')
    })

    it('validates ICO signature', () => {
      const icoBytes = new Uint8Array([0x00, 0x00, 0x01, 0x00, 0x01, 0x00])
      const res = verifyMagicBytes(icoBytes, 'image/x-icon')
      expect(res.valid).toBe(true)
      expect(res.detectedMime).toBe('image/x-icon')
    })

    it('blocks SVG for security reasons', () => {
      const svgBytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
      const res = verifyMagicBytes(svgBytes, 'image/svg+xml')
      expect(res.valid).toBe(false)
      expect(res.error).toContain('blocked for security reasons')
    })
  })

  describe('Documents', () => {
    it('validates PDF signature (%PDF-)', () => {
      const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x35])
      const res = verifyMagicBytes(pdfBytes, 'application/pdf')
      expect(res.valid).toBe(true)
      expect(res.detectedMime).toBe('application/pdf')
    })

    it('validates Office OpenXML (DOCX, XLSX, PPTX) Zip signatures', () => {
      const zipBytes = new Uint8Array([0x50, 0x4B, 0x03, 0x04, 0x14, 0x00])
      const docxRes = verifyMagicBytes(
        zipBytes,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      )
      expect(docxRes.valid).toBe(true)

      const xlsxRes = verifyMagicBytes(
        zipBytes,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
      expect(xlsxRes.valid).toBe(true)

      const pptxRes = verifyMagicBytes(
        zipBytes,
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      )
      expect(pptxRes.valid).toBe(true)
    })

    it('validates legacy MS Office (DOC, XLS, PPT) OLE CFBF signatures', () => {
      const oleBytes = new Uint8Array([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])
      expect(verifyMagicBytes(oleBytes, 'application/msword').valid).toBe(true)
      expect(verifyMagicBytes(oleBytes, 'application/vnd.ms-excel').valid).toBe(true)
      expect(verifyMagicBytes(oleBytes, 'application/vnd.ms-powerpoint').valid).toBe(true)
    })

    it('allows text/plain, text/csv and text/markdown without binary signature check', () => {
      const textBytes = new TextEncoder().encode('Plain text notes')
      expect(verifyMagicBytes(textBytes, 'text/plain').valid).toBe(true)

      const csvBytes = new TextEncoder().encode('id,val\n1,a')
      expect(verifyMagicBytes(csvBytes, 'text/csv').valid).toBe(true)

      const mdBytes = new TextEncoder().encode('# Markdown Header')
      expect(verifyMagicBytes(mdBytes, 'text/markdown').valid).toBe(true)
    })
  })

  describe('Archives & Data', () => {
    it('validates standard ZIP signature', () => {
      const zipBytes = new Uint8Array([0x50, 0x4B, 0x03, 0x04, 0x00, 0x00])
      expect(verifyMagicBytes(zipBytes, 'application/zip').valid).toBe(true)
    })

    it('validates 7z signature', () => {
      const sevenZipBytes = new Uint8Array([0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C])
      expect(verifyMagicBytes(sevenZipBytes, 'application/x-7z-compressed').valid).toBe(true)
    })

    it('validates GZ signature', () => {
      const gzBytes = new Uint8Array([0x1F, 0x8B, 0x08, 0x00])
      expect(verifyMagicBytes(gzBytes, 'application/gzip').valid).toBe(true)
    })

    it('validates TAR signature (ustar)', () => {
      const tarBytes = new Uint8Array(512)
      // Set 'ustar' at offset 257
      tarBytes[257] = 0x75
      tarBytes[258] = 0x73
      tarBytes[259] = 0x74
      tarBytes[260] = 0x61
      tarBytes[261] = 0x72
      expect(verifyMagicBytes(tarBytes, 'application/x-tar').valid).toBe(true)
    })

    it('allows application/json without binary signature check', () => {
      const jsonBytes = new TextEncoder().encode('{"ok":true}')
      expect(verifyMagicBytes(jsonBytes, 'application/json').valid).toBe(true)
    })
  })

  describe('Rejection & Mismatch Handling', () => {
    it('rejects PDF file declared as image/png', () => {
      const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D])
      const res = verifyMagicBytes(pdfBytes, 'image/png')
      expect(res.valid).toBe(false)
      expect(res.error).toContain('Signature mismatch')
    })

    it('rejects PNG file declared as image/jpeg', () => {
      const pngBytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
      const res = verifyMagicBytes(pngBytes, 'image/jpeg')
      expect(res.valid).toBe(false)
      expect(res.error).toContain('Signature mismatch: file is PNG but declared as image/jpeg')
    })

    it('rejects buffers smaller than 2 bytes', () => {
      const smallBuffer = new Uint8Array([0x01])
      const res = verifyMagicBytes(smallBuffer, 'image/png')
      expect(res.valid).toBe(false)
      expect(res.error).toBe('File buffer too small for signature inspection')
    })

    it('does not mislabel ZIP-container bytes as DOCX (#531)', () => {
      const zipBytes = new Uint8Array([0x50, 0x4B, 0x03, 0x04, 0x00, 0x00])
      const res = verifyMagicBytes(zipBytes, 'image/png')
      expect(res.valid).toBe(false)
      expect(res.detectedMime).toBeUndefined()
      expect(res.error).not.toContain('DOCX')
      expect(res.error).toContain('ZIP')
    })

    it('does not mislabel OLE2 bytes as DOC (#531)', () => {
      const oleBytes = new Uint8Array([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1, 0x00])
      const res = verifyMagicBytes(oleBytes, 'image/png')
      expect(res.valid).toBe(false)
      expect(res.detectedMime).toBeUndefined()
      expect(res.error).not.toContain('is DOC ')
      expect(res.error).toContain('OLE')
    })

    it('still names unambiguous formats and dedupes JPG/JPEG aliases', () => {
      const jpegBytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10])
      const res = verifyMagicBytes(jpegBytes, 'image/png')
      expect(res.detectedMime).toBe('image/jpeg')
      expect(res.error).toContain('Signature mismatch: file is JPG')
    })

    it.each([
      ['image/gif', 6, [0x47, 0x49, 0x46, 0x38]],
      ['image/webp', 12, [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00]],
      ['image/avif', 12, [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]],
      ['application/x-tar', 512, [0x75, 0x73, 0x74, 0x61, 0x72, 0x00]],
    ])('reports "too small" for truncated %s buffer (#531)', (mime, _min, head) => {
      const res = verifyMagicBytes(new Uint8Array(head), mime)
      expect(res.valid).toBe(false)
      expect(res.error).toBe('File buffer too small for signature inspection')
    })

    it('rejects unknown binary signatures for image types', () => {
      const randomBytes = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05])
      const res = verifyMagicBytes(randomBytes, 'image/png')
      expect(res.valid).toBe(false)
      expect(res.error).toContain('Unrecognized file signature')
    })
  })
})

describe('getFileTypeByExtension', () => {
  // Regression guard for #452: SUPPORTED_FILE_TYPES is a plain object literal, so an unguarded
  // index access reaches inherited Object.prototype members for these keys.
  it('returns undefined for __proto__ and constructor instead of an inherited Object.prototype member', () => {
    expect(getFileTypeByExtension('__proto__')).toBeUndefined()
    expect(getFileTypeByExtension('constructor')).toBeUndefined()
  })
})

describe('extensionFromUrl', () => {
  // Regression guard for #452: lastIndexOf('.') ran over the whole pathname, so a dot in a
  // directory segment (a versioned path, a CDN transform segment) was misread as the extension.
  it('ignores a dot in a directory segment and falls back to the query-param extension', () => {
    expect(extensionFromUrl('https://cdn.example.com/v1.2/photo')).toBeNull()
    expect(extensionFromUrl('https://res.cloudinary.com/demo/image/upload/w_0.5/sample')).toBeNull()
    expect(extensionFromUrl('https://example.com/photo?fm=jpg')).toBe('jpg')
  })

  it('reads the extension from the last path segment, ignoring a trailing slash', () => {
    expect(extensionFromUrl('https://example.com/photo.jpg')).toBe('jpg')
    expect(extensionFromUrl('https://example.com/photo.jpg/')).toBeNull()
  })
})

