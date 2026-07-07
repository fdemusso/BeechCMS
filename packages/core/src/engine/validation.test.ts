// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

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
import { validateAndSanitizeSeedPayload, isValidContentStatus } from './validation.js'
import type { Branch, Seed } from './types.js'

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

  it('detects a dangerous tag embedded in a text node string', () => {
    const maliciousDoc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '<script>alert(1)</script>' }] }],
    }
    const r = safeValidate({ ...validBase(), body: maliciousDoc })
    expect(r.dangerousFields).toContain('body')
  })

  it('detects an "on*" event handler attribute key inside richtext JSON', () => {
    const maliciousDoc = {
      type: 'doc',
      content: [{ type: 'image', attrs: { src: 'https://x.com/a.png', onError: 'alert(1)' } }],
    }
    const r = safeValidate({ ...validBase(), body: maliciousDoc })
    expect(r.dangerousFields).toContain('body')
  })

  it('rejects a richtext field given a non-object, non-string value', () => {
    const r = safeValidate({ ...validBase(), body: 12345 as unknown as Record<string, unknown> })
    expect(r.details.some(d => d.field === 'body')).toBe(true)
  })

  it('rejects richtext content exceeding maxTextLength', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x'.repeat(20) }] }] }
    const r = safeValidate({ ...validBase(), body: doc }, { maxTextLength: 10 })
    expect(r.details.some(d => d.field === 'body' && d.expected.includes('richtext(max:10)'))).toBe(true)
  })
})

// ─── 7b. RICHTEXT EMPTINESS DETECTION (required field) ───────────────────────

const RICHTEXT_REQUIRED_SEED: Seed = {
  slug: 'pages',
  label: 'Page',
  displayNameAlias: 'title',
  branches: [
    { alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
    { alias: 'body', label: 'Body', type: 'richtext', requiredOnCreate: true },
  ],
}

describe('required richtext field emptiness detection', () => {
  it('treats a doc with no text content as empty and reports it as missing', () => {
    const emptyDoc = { type: 'doc', content: [{ type: 'paragraph', content: [] }] }
    const r = validateAndSanitizeSeedPayload(RICHTEXT_REQUIRED_SEED, { title: 'T', body: emptyDoc }, { operation: 'create' })
    expect(r.requiredFieldsMissing).toContain('body')
  })

  it('treats a wrapped envelope with an empty doc as empty', () => {
    const emptyEnvelope = { schemaVersion: 1, doc: { type: 'doc', content: [] } }
    const r = validateAndSanitizeSeedPayload(RICHTEXT_REQUIRED_SEED, { title: 'T', body: emptyEnvelope }, { operation: 'create' })
    expect(r.requiredFieldsMissing).toContain('body')
  })

  it('treats a doc with only whitespace text as empty', () => {
    const whitespaceDoc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '   ' }] }] }
    const r = validateAndSanitizeSeedPayload(RICHTEXT_REQUIRED_SEED, { title: 'T', body: whitespaceDoc }, { operation: 'create' })
    expect(r.requiredFieldsMissing).toContain('body')
  })

  it('treats a doc with only latex content in attrs as non-empty', () => {
    const latexDoc = {
      type: 'doc',
      content: [{ type: 'mathBlock', attrs: { latex: 'x^2' }, content: [] }],
    }
    const r = validateAndSanitizeSeedPayload(RICHTEXT_REQUIRED_SEED, { title: 'T', body: latexDoc }, { operation: 'create' })
    expect(r.requiredFieldsMissing).not.toContain('body')
  })

  it('treats a doc with actual text content as non-empty', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }] }
    const r = validateAndSanitizeSeedPayload(RICHTEXT_REQUIRED_SEED, { title: 'T', body: doc }, { operation: 'create' })
    expect(r.requiredFieldsMissing).not.toContain('body')
  })
})

// ─── 7c. REQUIRED JSON FIELD EMPTINESS DETECTION ─────────────────────────────

const JSON_REQUIRED_SEED: Seed = {
  slug: 'configs',
  label: 'Config',
  displayNameAlias: 'name',
  branches: [
    { alias: 'name', label: 'Name', type: 'text', requiredOnCreate: true },
    { alias: 'settings', label: 'Settings', type: 'json', requiredOnCreate: true },
  ],
}

describe('required json field emptiness detection', () => {
  it('treats an empty object as empty for a required json field', () => {
    const r = validateAndSanitizeSeedPayload(JSON_REQUIRED_SEED, { name: 'X', settings: {} }, { operation: 'create' })
    expect(r.requiredFieldsMissing).toContain('settings')
  })

  it('treats a non-empty object as present for a required json field', () => {
    const r = validateAndSanitizeSeedPayload(JSON_REQUIRED_SEED, { name: 'X', settings: { a: 1 } }, { operation: 'create' })
    expect(r.requiredFieldsMissing).not.toContain('settings')
  })
})

// ─── 7d. NUMBER FIELD WITH numberOptions (min/max/step) ──────────────────────

const NUMBER_OPTS_SEED: Seed = {
  slug: 'inventory',
  label: 'Inventory',
  displayNameAlias: 'sku',
  branches: [
    { alias: 'sku', label: 'SKU', type: 'text', requiredOnCreate: true },
    { alias: 'rating', label: 'Rating', type: 'number', numberOptions: { min: 0, max: 5, step: 0.5 } },
  ],
}

describe('number field with numberOptions (min/max/step)', () => {
  it('accepts a value within bounds and aligned to the step', () => {
    const r = validateAndSanitizeSeedPayload(NUMBER_OPTS_SEED, { sku: 'A', rating: 2.5 }, { requireAtLeastOneValidField: true })
    expect(r.data.rating).toBe(2.5)
    expect(r.details.some(d => d.field === 'rating')).toBe(false)
  })

  it('accepts values exactly at the min and max boundaries', () => {
    const rMin = validateAndSanitizeSeedPayload(NUMBER_OPTS_SEED, { sku: 'A', rating: 0 }, { requireAtLeastOneValidField: true })
    expect(rMin.details.some(d => d.field === 'rating')).toBe(false)

    const rMax = validateAndSanitizeSeedPayload(NUMBER_OPTS_SEED, { sku: 'A', rating: 5 }, { requireAtLeastOneValidField: true })
    expect(rMax.details.some(d => d.field === 'rating')).toBe(false)
  })

  it('rejects a value below min', () => {
    const r = validateAndSanitizeSeedPayload(NUMBER_OPTS_SEED, { sku: 'A', rating: -1 }, { requireAtLeastOneValidField: true })
    expect(r.details.some(d => d.field === 'rating' && d.expected.includes('min:0'))).toBe(true)
  })

  it('rejects a value above max', () => {
    const r = validateAndSanitizeSeedPayload(NUMBER_OPTS_SEED, { sku: 'A', rating: 10 }, { requireAtLeastOneValidField: true })
    expect(r.details.some(d => d.field === 'rating' && d.expected.includes('max:5'))).toBe(true)
  })

  it('rejects a value not aligned to the step', () => {
    const r = validateAndSanitizeSeedPayload(NUMBER_OPTS_SEED, { sku: 'A', rating: 2.3 }, { requireAtLeastOneValidField: true })
    expect(r.details.some(d => d.field === 'rating' && d.expected.includes('step:0.5'))).toBe(true)
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
    expect(r.details.some(d => d.field === 'avatar' && d.expected.includes('image-url'))).toBe(true)
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
    expect(r.details.some(d => d.field === 'manual' && d.expected.includes('document-url'))).toBe(true)
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

  it('asset-list accepts a single non-JSON URL string and wraps it into an array', () => {
    const r = safeValidate({ ...validBase(), gallery: 'https://x.com/photo1.jpg' })
    expect(r.data.gallery).toEqual(['https://x.com/photo1.jpg'])
    expect(r.details.some(d => d.field === 'gallery')).toBe(false)
  })

  it('asset-list skips null/undefined entries inside the array', () => {
    const r = safeValidate({ ...validBase(), gallery: [null, 'https://x.com/a.jpg', undefined] })
    expect(r.data.gallery).toEqual(['https://x.com/a.jpg'])
    expect(r.details.some(d => d.field === 'gallery')).toBe(false)
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

// ─── 9. RELATION FIELD ───────────────────────────────────────────────────────

const UUID_V4 = '550e8400-e29b-41d4-a716-446655440000'

// Minimal generator that accepts only UUID v4 (mirrors SystemIdGenerator semantics)
const testIdGen = {
  uuid: () => UUID_V4,
  isValid: (v: unknown): v is string =>
    typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
}

const RELATION_SEED: Seed = {
  slug: 'articles',
  label: 'Article',
  displayNameAlias: 'title',
  branches: [
    { alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
    { alias: 'author_id', label: 'Author', type: 'relation', targetSeed: 'team' },
    { alias: 'editor_id', label: 'Editor', type: 'relation', targetSeed: 'team', requiredOnCreate: true },
    { alias: 'coauthor_ids', label: 'Co-authors', type: 'relation', targetSeed: 'team', multiple: true },
  ],
}

describe('relation field', () => {
  it('accepts a valid UUID v4', () => {
    const r = validateAndSanitizeSeedPayload(
      RELATION_SEED,
      { title: 'T', author_id: UUID_V4, editor_id: UUID_V4 },
      { operation: 'create', idGenerator: testIdGen, requireAtLeastOneValidField: true, enforceRequiredFields: true },
    )
    expect(r.data.author_id).toBe(UUID_V4)
    expect(r.details.some(d => d.field === 'author_id')).toBe(false)
  })

  it('rejects empty string', () => {
    const r = validateAndSanitizeSeedPayload(
      RELATION_SEED,
      { title: 'T', author_id: '', editor_id: UUID_V4 },
      { operation: 'create', idGenerator: testIdGen, requireAtLeastOneValidField: true, enforceRequiredFields: true },
    )
    expect(r.details.some(d => d.field === 'author_id')).toBe(true)
  })

  it('rejects a non-id-shaped string', () => {
    const r = validateAndSanitizeSeedPayload(
      RELATION_SEED,
      { title: 'T', author_id: 'hello', editor_id: UUID_V4 },
      { operation: 'create', idGenerator: testIdGen, requireAtLeastOneValidField: true, enforceRequiredFields: true },
    )
    expect(r.details.some(d => d.field === 'author_id')).toBe(true)
  })

  it('accepts null for optional relation when allowNull is true (update context)', () => {
    const r = validateAndSanitizeSeedPayload(
      RELATION_SEED,
      { title: 'T', author_id: null, editor_id: UUID_V4 },
      { operation: 'update', allowNull: true, idGenerator: testIdGen, requireAtLeastOneValidField: true, enforceRequiredFields: false },
    )
    expect(r.details.some(d => d.field === 'author_id')).toBe(false)
    expect(r.data.author_id).toBeNull()
  })

  it('rejects null for a required relation when allowNull is false', () => {
    const r = validateAndSanitizeSeedPayload(
      RELATION_SEED,
      { title: 'T', author_id: UUID_V4, editor_id: null },
      { operation: 'create', allowNull: false, idGenerator: testIdGen, requireAtLeastOneValidField: true, enforceRequiredFields: true },
    )
    expect(r.requiredFieldsMissing).toContain('editor_id')
  })

  it('throws when idGenerator is missing and seed has relation branches', () => {
    expect(() =>
      validateAndSanitizeSeedPayload(
        RELATION_SEED,
        { title: 'T', editor_id: UUID_V4 },
        { operation: 'create' },
      )
    ).toThrow('IIdGenerator must be provided')
  })

  it('accepts an array of valid UUIDs with no duplicates for a multi-relation field', () => {
    const r = validateAndSanitizeSeedPayload(
      RELATION_SEED,
      { title: 'T', editor_id: UUID_V4, coauthor_ids: [UUID_V4] },
      { operation: 'create', idGenerator: testIdGen, requireAtLeastOneValidField: true, enforceRequiredFields: true },
    )
    expect(r.data.coauthor_ids).toEqual([UUID_V4])
    expect(r.details.some(d => d.field === 'coauthor_ids')).toBe(false)
  })

  it('rejects duplicate ids in a multi-relation array', () => {
    const r = validateAndSanitizeSeedPayload(
      RELATION_SEED,
      { title: 'T', editor_id: UUID_V4, coauthor_ids: [UUID_V4, UUID_V4] },
      { operation: 'create', idGenerator: testIdGen, requireAtLeastOneValidField: true, enforceRequiredFields: true },
    )
    expect(r.details.some(d => d.field === 'coauthor_ids')).toBe(true)
  })

  it('accepts null for an optional multi-relation field when allowNull is true', () => {
    const r = validateAndSanitizeSeedPayload(
      RELATION_SEED,
      { title: 'T', editor_id: UUID_V4, coauthor_ids: null },
      { operation: 'update', allowNull: true, idGenerator: testIdGen, requireAtLeastOneValidField: true, enforceRequiredFields: false },
    )
    expect(r.data.coauthor_ids).toBeNull()
    expect(r.details.some(d => d.field === 'coauthor_ids')).toBe(false)
  })
})

// ─── 9b. UNHANDLED BRANCH TYPE ────────────────────────────────────────────────

describe('unhandled branch type', () => {
  it('throws a descriptive error for an unrecognized branch type', () => {
    const badSeed: Seed = {
      slug: 'broken',
      label: 'Broken',
      displayNameAlias: 'x',
      branches: [
        { alias: 'x', label: 'X', type: 'mystery' } as unknown as Branch,
      ],
    }
    expect(() => validateAndSanitizeSeedPayload(badSeed, { x: 'value' })).toThrow('Unhandled branch type')
  })
})

// ─── 9c. isValidContentStatus ────────────────────────────────────────────────

describe('isValidContentStatus', () => {
  it('returns true for each valid status value', () => {
    expect(isValidContentStatus('draft')).toBe(true)
    expect(isValidContentStatus('review')).toBe(true)
    expect(isValidContentStatus('published')).toBe(true)
  })

  it('returns false for invalid or non-string values', () => {
    expect(isValidContentStatus('archived')).toBe(false)
    expect(isValidContentStatus(123)).toBe(false)
    expect(isValidContentStatus(null)).toBe(false)
  })
})

// ─── 10. GARBAGE KEYS & OVERALL RESILIENCE ───────────────────────────────────

describe('garbage keys and overall resilience (§10)', () => {
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

// ─── 11. REPEATER FIELD (Sprint 10) ──────────────────────────────────────────

describe('repeater field', () => {
  const REPEATER_SEED: Seed = {
    slug: 'faq',
    label: 'FAQ',
    displayNameAlias: 'title',
    branches: [
      { id: 'br_title', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
      {
        id: 'br_items', alias: 'items', label: 'Items', type: 'repeater',
        fields: [
          { id: 'br_question', alias: 'question', label: 'Question', type: 'text', requiredOnCreate: true },
          { id: 'br_answer', alias: 'answer', label: 'Answer', type: 'richtext' },
          { id: 'br_order', alias: 'order', label: 'Order', type: 'number' },
        ],
      },
    ],
  }

  function validateRepeater(
    payload: Record<string, unknown>,
    opts?: Parameters<typeof validateAndSanitizeSeedPayload>[2],
  ) {
    return validateAndSanitizeSeedPayload(REPEATER_SEED, payload, { operation: 'create', ...opts })
  }

  it('accepts a valid array of items', () => {
    const r = validateRepeater({
      title: 'My FAQ',
      items: [
        { question: 'Q1', answer: 'A1', order: 1 },
        { question: 'Q2', answer: 'A2', order: 2 },
      ],
    })
    expect(r.details).toEqual([])
    expect(r.data.items).toEqual([
      { question: 'Q1', answer: 'A1', order: 1 },
      { question: 'Q2', answer: 'A2', order: 2 },
    ])
  })

  it('accepts an empty array', () => {
    const r = validateRepeater({ title: 'My FAQ', items: [] })
    expect(r.details.some(d => d.field === 'items')).toBe(false)
    expect(r.data.items).toEqual([])
  })

  it('rejects a non-array value', () => {
    const r = validateRepeater({ title: 'My FAQ', items: { question: 'Q1' } })
    expect(r.details.some(d => d.field === 'items')).toBe(true)
    expect(r.data).not.toHaveProperty('items')
  })

  it('fails when a required sub-branch is missing in an item', () => {
    const r = validateRepeater({
      title: 'My FAQ',
      items: [{ answer: 'A1' }],
    })
    expect(r.details.some(d => d.field === 'items')).toBe(true)
    expect(r.data).not.toHaveProperty('items')
  })

  it('strips unknown keys from each item', () => {
    const r = validateRepeater({
      title: 'My FAQ',
      items: [{ question: 'Q1', answer: 'A1', order: 1, legacyAlias: 'old-data' }],
    })
    expect(r.details).toEqual([])
    expect(r.data.items).toEqual([{ question: 'Q1', answer: 'A1', order: 1 }])
    expect(r.data.items as unknown[]).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ legacyAlias: expect.anything() })]),
    )
  })

  it('rejects disallowed sub-types (relation/file/nested repeater) by ignoring them', () => {
    const seedWithDisallowed: Seed = {
      ...REPEATER_SEED,
      branches: [
        REPEATER_SEED.branches[0],
        {
          id: 'br_items', alias: 'items', label: 'Items', type: 'repeater',
          fields: [
            { id: 'br_question', alias: 'question', label: 'Question', type: 'text', requiredOnCreate: true },
            { id: 'br_rel', alias: 'rel', label: 'Rel', type: 'relation', targetSeed: 'tags' },
            { id: 'br_file', alias: 'file', label: 'File', type: 'file' },
            { id: 'br_nested', alias: 'nested', label: 'Nested', type: 'repeater', fields: [] },
          ],
        },
      ],
    }
    const r = validateAndSanitizeSeedPayload(seedWithDisallowed, {
      title: 'My FAQ',
      items: [{ question: 'Q1', rel: 'should-be-stripped', file: 'should-be-stripped', nested: [] }],
    }, { operation: 'create' })
    expect(r.details).toEqual([])
    expect(r.data.items).toEqual([{ question: 'Q1' }])
  })
})

// ─── 12. REPEATER CARDINALITY BOUNDS (Sprint 11) ─────────────────────────────

describe('repeater cardinality bounds', () => {
  function seedWithBounds(bounds: { minItems?: number; maxItems?: number }): Seed {
    return {
      slug: 'faq',
      label: 'FAQ',
      displayNameAlias: 'title',
      branches: [
        { id: 'br_title', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
        {
          id: 'br_items', alias: 'items', label: 'Items', type: 'repeater',
          ...bounds,
          fields: [
            { id: 'br_question', alias: 'question', label: 'Question', type: 'text', requiredOnCreate: true },
          ],
        },
      ],
    }
  }

  function validate(seed: Seed, payload: Record<string, unknown>) {
    return validateAndSanitizeSeedPayload(seed, payload, { operation: 'create' })
  }

  it('maxItems: a 3-item array fails, a 2-item array passes', () => {
    const seed = seedWithBounds({ maxItems: 2 })
    const tooMany = validate(seed, {
      title: 'My FAQ',
      items: [{ question: 'Q1' }, { question: 'Q2' }, { question: 'Q3' }],
    })
    expect(tooMany.details.some(d => d.field === 'items')).toBe(true)

    const ok = validate(seed, {
      title: 'My FAQ',
      items: [{ question: 'Q1' }, { question: 'Q2' }],
    })
    expect(ok.details).toEqual([])
    expect(ok.data.items).toHaveLength(2)
  })

  it('minItems: an explicit empty array fails, a 1-item array passes', () => {
    const seed = seedWithBounds({ minItems: 1 })
    const empty = validate(seed, { title: 'My FAQ', items: [] })
    expect(empty.details.some(d => d.field === 'items')).toBe(true)

    const ok = validate(seed, { title: 'My FAQ', items: [{ question: 'Q1' }] })
    expect(ok.details).toEqual([])
    expect(ok.data.items).toHaveLength(1)
  })

  it('minItems: an absent/null value still passes (bounds gate length, not presence)', () => {
    const seed = seedWithBounds({ minItems: 1 })
    const absent = validate(seed, { title: 'My FAQ' })
    expect(absent.details.some(d => d.field === 'items')).toBe(false)

    const nullValue = validate(seed, { title: 'My FAQ', items: null })
    expect(nullValue.details.some(d => d.field === 'items')).toBe(false)
  })

  it('minItems with requiredOnCreate: an absent value fails', () => {
    const seed = seedWithBounds({ minItems: 1 })
    seed.branches[1].requiredOnCreate = true
    const r = validate(seed, { title: 'My FAQ' })
    expect(r.details.some(d => d.field === 'items')).toBe(true)
  })

  it('minItems: 1, maxItems: 1 round-trips exactly one item; rejects 0 and 2 when provided', () => {
    const seed = seedWithBounds({ minItems: 1, maxItems: 1 })

    const one = validate(seed, { title: 'My FAQ', items: [{ question: 'Q1' }] })
    expect(one.details).toEqual([])
    expect(one.data.items).toEqual([{ question: 'Q1' }])

    const zero = validate(seed, { title: 'My FAQ', items: [] })
    expect(zero.details.some(d => d.field === 'items')).toBe(true)

    const two = validate(seed, {
      title: 'My FAQ',
      items: [{ question: 'Q1' }, { question: 'Q2' }],
    })
    expect(two.details.some(d => d.field === 'items')).toBe(true)
  })

  it('bounds on a non-repeater branch do not affect that branch validation', () => {
    const seed: Seed = {
      slug: 'faq',
      label: 'FAQ',
      displayNameAlias: 'title',
      branches: [
        {
          id: 'br_title', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true,
          minItems: 1, maxItems: 1,
        } as Seed['branches'][number],
      ],
    }
    const r = validateAndSanitizeSeedPayload(seed, { title: 'Hello' }, { operation: 'create' })
    expect(r.details).toEqual([])
    expect(r.data.title).toBe('Hello')
  })

  it('two seeds identical except for maxItems compile to different schemas (no cache collision)', () => {
    const seedNoBound = seedWithBounds({})
    const seedMax1 = seedWithBounds({ maxItems: 1 })

    const payload = {
      title: 'My FAQ',
      items: [{ question: 'Q1' }, { question: 'Q2' }],
    }

    const noBoundResult = validate(seedNoBound, payload)
    expect(noBoundResult.details).toEqual([])
    expect(noBoundResult.data.items).toHaveLength(2)

    const max1Result = validate(seedMax1, payload)
    expect(max1Result.details.some(d => d.field === 'items')).toBe(true)
  })

  it('two seeds identical except for sub-branch numberOptions compile to different schemas (no cache collision)', () => {
    const seedWithSubBounds = (numberOptions: { min?: number; max?: number; step?: number }): Seed => ({
      slug: 'faq',
      label: 'FAQ',
      displayNameAlias: 'title',
      branches: [
        { id: 'br_title', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
        {
          id: 'br_items', alias: 'items', label: 'Items', type: 'repeater',
          fields: [
            { id: 'br_question', alias: 'question', label: 'Question', type: 'text', requiredOnCreate: true },
            { id: 'br_rating', alias: 'rating', label: 'Rating', type: 'number', numberOptions },
          ],
        },
      ],
    })

    const seedA = seedWithSubBounds({ min: 1, max: 10, step: 1 })
    const seedB = seedWithSubBounds({ min: 5, max: 20, step: 2 })

    const payload = {
      title: 'My FAQ',
      items: [{ question: 'Q1', rating: 15 }],
    }

    const resultA = validateAndSanitizeSeedPayload(seedA, payload, { operation: 'create' })
    expect(resultA.details.some(d => d.field === 'items')).toBe(true)

    const resultB = validateAndSanitizeSeedPayload(seedB, payload, { operation: 'create' })
    expect(resultB.details).toEqual([])
    expect(resultB.data.items).toEqual([{ question: 'Q1', rating: 15 }])
  })
})




