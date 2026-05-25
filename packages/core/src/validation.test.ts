/**
 * @file validation.test.ts
 * Chaos & edge-case test suite for `validateAndSanitizeSeedPayload`.
 *
 * Strategy: throw every conceivable garbage value at each branch type and
 * verify the function NEVER throws, always returns a well-formed result, and
 * produces accurate error details or clean sanitised data.
 *
 * TODO: add relation-field tests here once the `relation` branch type is
 * implemented in the core engine (e.g. type: 'relation', ref: 'seed-slug').
 */
import { describe, it, expect } from 'vitest'
import { validateAndSanitizeSeedPayload } from './validation'
import type { Seed } from './types'

// ─── Frankenstein Seed (covers every branch type) ────────────────────────────

const CHAOS_SEED: Seed = {
  slug: 'chaos',
  label: 'Chaos',
  displayNameAlias: 'title',
  branches: [
    // text
    { alias: 'title',       label: 'Title',       type: 'text', requiredOnCreate: true },
    { alias: 'subtitle',    label: 'Subtitle',    type: 'text' },
    // richtext
    { alias: 'body',        label: 'Body',        type: 'richtext' },
    // number
    { alias: 'price',       label: 'Price',       type: 'number' },
    { alias: 'qty',         label: 'Quantity',    type: 'number', requiredOnCreate: true },
    // boolean
    { alias: 'active',      label: 'Active',      type: 'boolean' },
    // date
    { alias: 'publishedAt', label: 'Published',   type: 'date' },
    // file (single)
    { alias: 'cover',       label: 'Cover',       type: 'file' },
    // file (asset-list)
    { alias: 'gallery',     label: 'Gallery',     type: 'file', multiple: true, format: 'asset-list' },
    // file with fileOptions
    { alias: 'avatar',      label: 'Avatar',      type: 'file', fileOptions: { accept: 'image' } },
    { alias: 'manual',      label: 'Manual',      type: 'file', fileOptions: { accept: 'document' } },
    { alias: 'archive',     label: 'Archive',     type: 'file', fileOptions: { accept: 'any' } },
    { alias: 'docs',        label: 'Docs',        type: 'file', multiple: true, format: 'asset-list', fileOptions: { accept: 'document' } },
    // json
    { alias: 'meta',        label: 'Meta',        type: 'json' },
    // tags
    { alias: 'tags',        label: 'Tags',        type: 'tags' },
  ],
}

// Helper: a minimal valid payload that satisfies all required-on-create fields.
function validBase(): Record<string, unknown> {
  return {
    title: 'Valid Title',
    qty: 1,
  }
}

// Helper: assert function never throws and result is structurally sound.
function safeValidate(
  payload: Record<string, unknown>,
  opts?: Parameters<typeof validateAndSanitizeSeedPayload>[2],
) {
  let result: ReturnType<typeof validateAndSanitizeSeedPayload>
  expect(() => {
    result = validateAndSanitizeSeedPayload(CHAOS_SEED, payload, opts)
  }).not.toThrow()
  expect(result!).toHaveProperty('data')
  expect(result!).toHaveProperty('details')
  expect(result!).toHaveProperty('unknownAliases')
  expect(result!).toHaveProperty('dangerousFields')
  expect(result!).toHaveProperty('requiredFieldsMissing')
  return result!
}

// ─── 1. TEXT FIELD ────────────────────────────────────────────────────────────

describe('text field', () => {
  it('accepts a plain ASCII string', () => {
    const r = safeValidate({ ...validBase(), subtitle: 'hello world' })
    expect(r.data.subtitle).toBe('hello world')
    expect(r.details).toHaveLength(0)
  })

  it('strips leading/trailing whitespace', () => {
    const r = safeValidate({ ...validBase(), subtitle: '   trimmed   ' })
    expect(r.data.subtitle).toBe('trimmed')
  })

  it('strips control characters (null bytes, BEL, etc.)', () => {
    const r = safeValidate({ ...validBase(), subtitle: 'ab\u0000cd\u0007ef' })
    expect(r.data.subtitle).toBe('abcdef')
  })

  it('accepts unicode emoji and accented characters', () => {
    const r = safeValidate({ ...validBase(), subtitle: 'Ünïcödé 🎉' })
    expect(r.data.subtitle).toBe('Ünïcödé 🎉')
  })

  it('rejects number value for text field', () => {
    const r = safeValidate({ ...validBase(), subtitle: 42 })
    expect(r.details.some(d => d.field === 'subtitle')).toBe(true)
  })

  it('rejects boolean value for text field', () => {
    const r = safeValidate({ ...validBase(), subtitle: true })
    expect(r.details.some(d => d.field === 'subtitle')).toBe(true)
  })

  it('rejects array for text field', () => {
    const r = safeValidate({ ...validBase(), subtitle: ['a', 'b'] })
    expect(r.details.some(d => d.field === 'subtitle')).toBe(true)
  })

  it('rejects plain object for text field', () => {
    const r = safeValidate({ ...validBase(), subtitle: { value: 'x' } })
    expect(r.details.some(d => d.field === 'subtitle')).toBe(true)
  })

  it('rejects a string exceeding maxTextLength', () => {
    const r = safeValidate({ ...validBase(), subtitle: 'x'.repeat(50001) })
    expect(r.details.some(d => d.field === 'subtitle')).toBe(true)
  })

  it('accepts a string exactly at the limit', () => {
    const r = safeValidate({ ...validBase(), subtitle: 'x'.repeat(50000) })
    expect(r.details.some(d => d.field === 'subtitle')).toBe(false)
  })

  it('required text field: rejects empty string', () => {
    const r = safeValidate({ ...validBase(), title: '' })
    expect(r.requiredFieldsMissing).toContain('title')
  })

  it('required text field: rejects whitespace-only string', () => {
    const r = safeValidate({ ...validBase(), title: '   ' })
    expect(r.requiredFieldsMissing).toContain('title')
  })

  it('required text field: rejects null', () => {
    const r = safeValidate({ ...validBase(), title: null as unknown as string })
    expect(r.requiredFieldsMissing).toContain('title')
  })
})

// ─── 2. NUMBER FIELD ──────────────────────────────────────────────────────────

describe('number field', () => {
  it('accepts zero', () => {
    const r = safeValidate({ ...validBase(), price: 0 })
    expect(r.data.price).toBe(0)
  })

  it('accepts a positive float', () => {
    const r = safeValidate({ ...validBase(), price: 9.99 })
    expect(r.data.price).toBe(9.99)
  })

  it('accepts a negative number', () => {
    const r = safeValidate({ ...validBase(), price: -100 })
    expect(r.data.price).toBe(-100)
  })

  it('accepts MAX_SAFE_INTEGER', () => {
    const r = safeValidate({ ...validBase(), price: Number.MAX_SAFE_INTEGER })
    expect(r.data.price).toBe(Number.MAX_SAFE_INTEGER)
  })

  it('accepts MIN_SAFE_INTEGER', () => {
    const r = safeValidate({ ...validBase(), price: Number.MIN_SAFE_INTEGER })
    expect(r.data.price).toBe(Number.MIN_SAFE_INTEGER)
  })

  it('accepts MAX_VALUE (within finite range)', () => {
    const r = safeValidate({ ...validBase(), price: Number.MAX_VALUE })
    expect(r.data.price).toBe(Number.MAX_VALUE)
  })

  it('rejects Infinity', () => {
    const r = safeValidate({ ...validBase(), price: Infinity })
    expect(r.details.some(d => d.field === 'price')).toBe(true)
  })

  it('rejects -Infinity', () => {
    const r = safeValidate({ ...validBase(), price: -Infinity })
    expect(r.details.some(d => d.field === 'price')).toBe(true)
  })

  it('rejects NaN', () => {
    const r = safeValidate({ ...validBase(), price: NaN })
    expect(r.details.some(d => d.field === 'price')).toBe(true)
  })

  it('rejects numeric string "42"', () => {
    const r = safeValidate({ ...validBase(), price: '42' })
    expect(r.details.some(d => d.field === 'price')).toBe(true)
  })

  it('rejects boolean true', () => {
    const r = safeValidate({ ...validBase(), price: true })
    expect(r.details.some(d => d.field === 'price')).toBe(true)
  })

  it('treats null as absent for optional number when allowNull is false', () => {
    const r = safeValidate({ ...validBase(), price: null as unknown as number }, { allowNull: false })
    expect(r.details.some(d => d.field === 'price')).toBe(false)
  })

  it('treats empty string as absent for optional number', () => {
    const r = safeValidate({ ...validBase(), price: '' as unknown as number })
    // empty string → undefined → optional field silently skipped
    expect(r.details.filter(d => d.field === 'price')).toHaveLength(0)
  })

  it('required number: rejects empty string', () => {
    const r = safeValidate({ ...validBase(), qty: '' as unknown as number })
    expect(r.requiredFieldsMissing).toContain('qty')
  })

  it('required number: rejects null', () => {
    const r = safeValidate({ ...validBase(), qty: null as unknown as number })
    expect(r.requiredFieldsMissing).toContain('qty')
  })
})

// ─── 3. BOOLEAN FIELD ─────────────────────────────────────────────────────────

describe('boolean field', () => {
  it('accepts true', () => {
    const r = safeValidate({ ...validBase(), active: true })
    expect(r.data.active).toBe(true)
  })

  it('accepts false', () => {
    const r = safeValidate({ ...validBase(), active: false })
    expect(r.data.active).toBe(false)
  })

  it('rejects string "true"', () => {
    const r = safeValidate({ ...validBase(), active: 'true' })
    expect(r.details.some(d => d.field === 'active')).toBe(true)
  })

  it('rejects number 1', () => {
    const r = safeValidate({ ...validBase(), active: 1 })
    expect(r.details.some(d => d.field === 'active')).toBe(true)
  })

  it('treats empty string as absent for optional boolean', () => {
    const r = safeValidate({ ...validBase(), active: '' as unknown as boolean })
    expect(r.details.filter(d => d.field === 'active')).toHaveLength(0)
  })
})

// ─── 4. DATE FIELD ────────────────────────────────────────────────────────────

describe('date field', () => {
  it('accepts a valid ISO date string', () => {
    const r = safeValidate({ ...validBase(), publishedAt: '2026-05-14' })
    expect(r.data.publishedAt).toBe('2026-05-14')
  })

  it('accepts a valid full ISO datetime string', () => {
    const r = safeValidate({ ...validBase(), publishedAt: '2026-05-14T12:00:00Z' })
    expect(r.data.publishedAt).toBe('2026-05-14T12:00:00Z')
  })

  it('rejects malformed date string', () => {
    const r = safeValidate({ ...validBase(), publishedAt: '2026/05/14' })
    expect(r.details.some(d => d.field === 'publishedAt')).toBe(true)
  })

  it('rejects invalid logical date (e.g. February 30)', () => {
    const r = safeValidate({ ...validBase(), publishedAt: '2026-02-30' })
    expect(r.details.some(d => d.field === 'publishedAt')).toBe(true)
  })

  it('rejects native JS Date object', () => {
    const r = safeValidate({ ...validBase(), publishedAt: new Date() })
    expect(r.details.some(d => d.field === 'publishedAt')).toBe(true)
  })

  it('treats empty string as absent for optional date', () => {
    const r = safeValidate({ ...validBase(), publishedAt: '' })
    expect(r.details.filter(d => d.field === 'publishedAt')).toHaveLength(0)
  })
})

// ─── 5. FILE FIELD (SINGLE & ASSET-LIST) ──────────────────────────────────────

describe('file field', () => {
  it('single: accepts valid https url', () => {
    const r = safeValidate({ ...validBase(), cover: 'https://example.com/img.png' })
    expect(r.data.cover).toBe('https://example.com/img.png')
  })

  it('single: normalizes http url without throwing', () => {
    const r = safeValidate({ ...validBase(), cover: 'http://insecure.com/asset.jpg' })
    expect(r.data.cover).toBe('http://insecure.com/asset.jpg')
  })

  it('single: rejects local file paths and non-http protocols', () => {
    const r1 = safeValidate({ ...validBase(), cover: 'file:///etc/passwd' })
    expect(r1.details.some(d => d.field === 'cover')).toBe(true)

    const r2 = safeValidate({ ...validBase(), cover: 'ftp://server/file.zip' })
    expect(r2.details.some(d => d.field === 'cover')).toBe(true)
  })

  it('single: treats empty string as absent for optional file', () => {
    const r = safeValidate({ ...validBase(), cover: '' })
    expect(r.details.filter(d => d.field === 'cover')).toHaveLength(0)
  })

  it('asset-list: accepts an array of valid URLs', () => {
    const urls = ['https://a.com/1.jpg', 'https://b.com/2.png']
    const r = safeValidate({ ...validBase(), gallery: urls })
    expect(r.data.gallery).toEqual(urls)
  })

  it('asset-list: deduplicates identical URLs', () => {
    const r = safeValidate({ ...validBase(), gallery: ['https://a.com/1.jpg', 'https://a.com/1.jpg'] })
    expect(r.data.gallery).toEqual(['https://a.com/1.jpg'])
  })

  it('asset-list: parses JSON string array representation', () => {
    const urls = ['https://a.com/1.jpg']
    const r = safeValidate({ ...validBase(), gallery: JSON.stringify(urls) })
    expect(r.data.gallery).toEqual(urls)
  })

  it('asset-list: extracts URL from rich media objects (e.g. uploader output)', () => {
    const r = safeValidate({ ...validBase(), gallery: [{ url: 'https://a.com/obj.png', size: 123 }] })
    expect(r.data.gallery).toEqual(['https://a.com/obj.png'])
  })

  it('asset-list: rejects array containing invalid item', () => {
    const r = safeValidate({ ...validBase(), gallery: ['https://a.com/1.jpg', 'not-a-url'] })
    expect(r.details.some(d => d.field === 'gallery')).toBe(true)
  })

  it('asset-list: treats empty string as absent for optional list', () => {
    const r = safeValidate({ ...validBase(), gallery: '' })
    expect(r.details.filter(d => d.field === 'gallery')).toHaveLength(0)
  })
})

// ─── 6. JSON & TAGS FIELDS ────────────────────────────────────────────────────

describe('json and tags fields', () => {
  it('accepts a valid plain object', () => {
    const r = safeValidate({ ...validBase(), meta: { a: 1, b: 'two' } })
    expect(r.data.meta).toEqual({ a: 1, b: 'two' })
  })

  it('accepts a valid array', () => {
    const r = safeValidate({ ...validBase(), tags: ['news', 'tech'] })
    expect(r.data.tags).toEqual(['news', 'tech'])
  })

  it('rejects a primitive string (even if valid JSON string)', () => {
    const r = safeValidate({ ...validBase(), meta: '{"a":1}' })
    expect(r.details.some(d => d.field === 'meta')).toBe(true)
  })

  it('treats empty string as absent for optional json', () => {
    const r = safeValidate({ ...validBase(), meta: '' })
    expect(r.details.filter(d => d.field === 'meta')).toHaveLength(0)
  })
})

// ─── 7. RICHTEXT FIELD ────────────────────────────────────────────────────────

describe('richtext field', () => {
  it('accepts a valid unwrapped tiptap JSON doc', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }] }
    const r = safeValidate({ ...validBase(), body: doc })
    expect(r.data.body).toEqual(doc)
  })

  it('accepts a wrapped RichtextEnvelopeV1 doc', () => {
    const inner = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }] }
    const env = { schemaVersion: 1, doc: inner }
    const r = safeValidate({ ...validBase(), body: env })
    expect(r.data.body).toEqual(env)
  })

  it('rejects invalid JSON structure lacking type: "doc"', () => {
    const invalid = { content: [{ type: 'text', text: 'no doc root' }] }
    const r = safeValidate({ ...validBase(), body: invalid })
    expect(r.details.some(d => d.field === 'body')).toBe(true)
  })

  it('detects and reports basic XSS tag in plain string richtext', () => {
    const r = safeValidate({ ...validBase(), body: '<script>alert(1)</script>' })
    expect(r.dangerousFields).toContain('body')
  })

  it('detects and reports script node type inside richtext JSON', () => {
    const maliciousDoc = {
      type: 'doc',
      content: [{ type: 'script', attrs: { src: 'http://evil.com' } }],
    }
    const r = safeValidate({ ...validBase(), body: maliciousDoc })
    expect(r.dangerousFields).toContain('body')
  })

  it('detects javascript: protocol inside link attrs', () => {
    const maliciousDoc = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          text: 'click me',
          marks: [{ type: 'link', attrs: { href: 'javascript:alert(document.cookie)' } }],
        }],
      }],
    }
    // Note: the sanitizer inspects all keys/objects recursively. Link-like attrs trigger check.
    const r = safeValidate({ ...validBase(), body: maliciousDoc })
    expect(r.dangerousFields).toContain('body')
  })
})

// ─── 8. FILE OPTIONS ─────────────────────────────────────────────────────────

describe('fileOptions', () => {
  // accept: 'image'
  it("accept:'image' accetta URL con estensione .png", () => {
    const r = safeValidate({ ...validBase(), avatar: 'https://x.com/a.png' })
    expect(r.data.avatar).toBe('https://x.com/a.png')
    expect(r.details.some(d => d.field === 'avatar')).toBe(false)
  })

  it("accept:'image' accetta URL con estensione maiuscola e query string", () => {
    const r = safeValidate({ ...validBase(), avatar: 'https://x.com/A.JPEG?q=1' })
    expect(r.data.avatar).toBe('https://x.com/A.JPEG?q=1')
    expect(r.details.some(d => d.field === 'avatar')).toBe(false)
  })

  it("accept:'image' rifiuta URL con estensione .pdf", () => {
    const r = safeValidate({ ...validBase(), avatar: 'https://x.com/a.pdf' })
    expect(r.details.some(d => d.field === 'avatar' && d.expected.includes('accept:image'))).toBe(true)
  })

  // accept: 'document'
  it("accept:'document' accetta .pdf", () => {
    const r = safeValidate({ ...validBase(), manual: 'https://x.com/doc.pdf' })
    expect(r.data.manual).toBe('https://x.com/doc.pdf')
    expect(r.details.some(d => d.field === 'manual')).toBe(false)
  })

  it("accept:'document' accetta .docx", () => {
    const r = safeValidate({ ...validBase(), manual: 'https://x.com/report.docx' })
    expect(r.data.manual).toBe('https://x.com/report.docx')
    expect(r.details.some(d => d.field === 'manual')).toBe(false)
  })

  it("accept:'document' accetta .csv", () => {
    const r = safeValidate({ ...validBase(), manual: 'https://x.com/data.csv' })
    expect(r.data.manual).toBe('https://x.com/data.csv')
    expect(r.details.some(d => d.field === 'manual')).toBe(false)
  })

  it("accept:'document' rifiuta .png", () => {
    const r = safeValidate({ ...validBase(), manual: 'https://x.com/photo.png' })
    expect(r.details.some(d => d.field === 'manual' && d.expected.includes('accept:document'))).toBe(true)
  })

  // accept: 'any'
  it("accept:'any' accetta qualsiasi URL valido con estensione .zip", () => {
    const r = safeValidate({ ...validBase(), archive: 'https://x.com/backup.zip' })
    expect(r.data.archive).toBe('https://x.com/backup.zip')
    expect(r.details.some(d => d.field === 'archive')).toBe(false)
  })

  it("accept:'any' accetta URL valido senza estensione", () => {
    const r = safeValidate({ ...validBase(), archive: 'https://api.example.com/resource/abc123' })
    expect(r.data.archive).toBeDefined()
    expect(r.details.some(d => d.field === 'archive')).toBe(false)
  })

  // branch senza fileOptions → accept:'any'
  it("branch senza fileOptions si comporta come accept:'any' — accetta .exe", () => {
    const r = safeValidate({ ...validBase(), cover: 'https://x.com/app.exe' })
    expect(r.data.cover).toBe('https://x.com/app.exe')
    expect(r.details.some(d => d.field === 'cover')).toBe(false)
  })

  // asset-list con accept:'document'
  it("asset-list accept:'document' rifiuta intero array se un item è .png", () => {
    const r = safeValidate({ ...validBase(), docs: ['https://x.com/doc.pdf', 'https://x.com/photo.png'] })
    expect(r.details.some(d => d.field === 'docs')).toBe(true)
  })

  it("asset-list accept:'document' accetta array di soli documenti", () => {
    const r = safeValidate({ ...validBase(), docs: ['https://x.com/a.pdf', 'https://x.com/b.docx'] })
    expect(r.data.docs).toEqual(['https://x.com/a.pdf', 'https://x.com/b.docx'])
    expect(r.details.some(d => d.field === 'docs')).toBe(false)
  })

  // cache check: stessa URL valida per 'any' ma non per 'image'
  it("cache: schemi con fileOptions diversi producono comportamenti distinti", () => {
    const seedImage: Seed = {
      slug: 'cache-test',
      label: 'Cache Test',
      displayNameAlias: 'file',
      branches: [{ alias: 'file', label: 'File', type: 'file', fileOptions: { accept: 'image' } }],
    }
    const seedAny: Seed = {
      slug: 'cache-test',
      label: 'Cache Test',
      displayNameAlias: 'file',
      branches: [{ alias: 'file', label: 'File', type: 'file', fileOptions: { accept: 'any' } }],
    }
    const zipUrl = 'https://x.com/archive.zip'
    const rImage = validateAndSanitizeSeedPayload(seedImage, { file: zipUrl }, { requireAtLeastOneValidField: true })
    const rAny = validateAndSanitizeSeedPayload(seedAny, { file: zipUrl }, { requireAtLeastOneValidField: true })
    expect(rImage.details.some(d => d.field === 'file')).toBe(true)
    expect(rAny.data.file).toBe(zipUrl)
  })
})

// ─── 9. GARBAGE KEYS & OVERALL RESILIENCE ────────────────────────────────────

describe('garbage keys and overall resilience', () => {
  it('isolates unknown properties into unknownAliases without failing valid keys', () => {
    const r = safeValidate({
      ...validBase(),
      junkKey: 'immondizia',
      systemId: 12345,
      __proto__: { injected: true },
    })
    expect(r.unknownAliases).toContain('junkKey')
    expect(r.unknownAliases).toContain('systemId')
    // strict object parsing drops unrecognized properties from output data
    expect(r.data).not.toHaveProperty('junkKey')
    expect(r.data).not.toHaveProperty('systemId')
  })

  it('handles a completely empty payload gracefully', () => {
    const r = safeValidate({})
    expect(r.requiredFieldsMissing).toContain('title')
    expect(r.requiredFieldsMissing).toContain('qty')
    expect(r.hasAnyValidField).toBe(false)
  })

  it('keeps data empty when validation fails overall to ensure atomic writes', () => {
    // cover fails as it expects url string, causing overall validation failure
    const r = safeValidate({ ...validBase(), cover: 'garbage-non-url' })
    expect(r.details.some(d => d.field === 'cover')).toBe(true)
    expect(r.data).toEqual({})
    expect(r.hasAnyValidField).toBe(false)
  })
})




