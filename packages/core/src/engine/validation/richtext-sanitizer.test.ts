import { describe, it, expect } from 'vitest'
import { validateAndSanitizeSeedPayload, isValidContentStatus } from './index.js'
import { sanitizeRichtext } from './richtext-sanitizer.js'
import type { Branch, Seed } from '../types.js'

const CHAOS_SEED: Seed = {
  slug: 'chaos',
  label: 'Chaos',
  displayNameAlias: 'title',
  branches: [
    // text
    { id: 'br_title', alias: 'title',       label: 'Title',       type: 'text', requiredOnCreate: true },
    { id: 'br_subtitle', alias: 'subtitle',    label: 'Subtitle',    type: 'text' },
    // richtext
    { id: 'br_body', alias: 'body',        label: 'Body',        type: 'richtext' },
    // number
    { id: 'br_price', alias: 'price',       label: 'Price',       type: 'number' },
    { id: 'br_qty', alias: 'qty',         label: 'Quantity',    type: 'number', requiredOnCreate: true },
    // boolean
    { id: 'br_active', alias: 'active',      label: 'Active',      type: 'boolean' },
    // date
    { id: 'br_publishedAt', alias: 'publishedAt', label: 'Published',   type: 'date' },
    // file (single)
    { id: 'br_cover', alias: 'cover',       label: 'Cover',       type: 'file' },
    // file (asset-list)
    { id: 'br_gallery', alias: 'gallery',     label: 'Gallery',     type: 'file', multiple: true, format: 'asset-list' },
    // file with fileOptions
    { id: 'br_avatar', alias: 'avatar',      label: 'Avatar',      type: 'file', fileOptions: { accept: 'image' } },
    { id: 'br_manual', alias: 'manual',      label: 'Manual',      type: 'file', fileOptions: { accept: 'document' } },
    { id: 'br_archive', alias: 'archive',     label: 'Archive',     type: 'file', fileOptions: { accept: 'any' } },
    { id: 'br_docs', alias: 'docs',        label: 'Docs',        type: 'file', multiple: true, format: 'asset-list', fileOptions: { accept: 'document' } },
    // json
    { id: 'br_meta', alias: 'meta',        label: 'Meta',        type: 'json' },
    // tags
    { id: 'br_tags', alias: 'tags',        label: 'Tags',        type: 'tags' },
  ],
}

function validBase(): Record<string, unknown> {
  return {
    title: 'Valid Title',
    qty: 1,
  }
}

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

const RICHTEXT_REQUIRED_SEED: Seed = {
  slug: 'pages',
  label: 'Page',
  displayNameAlias: 'title',
  branches: [
    { id: 'br_title', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
    { id: 'br_body', alias: 'body', label: 'Body', type: 'richtext', requiredOnCreate: true },
  ],
}

const JSON_REQUIRED_SEED: Seed = {
  slug: 'configs',
  label: 'Config',
  displayNameAlias: 'name',
  branches: [
    { id: 'br_name', alias: 'name', label: 'Name', type: 'text', requiredOnCreate: true },
    { id: 'br_settings', alias: 'settings', label: 'Settings', type: 'json', requiredOnCreate: true },
  ],
}

const NUMBER_OPTS_SEED: Seed = {
  slug: 'inventory',
  label: 'Inventory',
  displayNameAlias: 'sku',
  branches: [
    { id: 'br_sku', alias: 'sku', label: 'SKU', type: 'text', requiredOnCreate: true },
    { id: 'br_rating', alias: 'rating', label: 'Rating', type: 'number', numberOptions: { min: 0, max: 5, step: 0.5 } },
  ],
}

const SCI_STEP_SEED: Seed = {
  slug: 'sci-step',
  label: 'Sci Step',
  displayNameAlias: 'sku',
  branches: [
    { id: 'br_sku', alias: 'sku', label: 'SKU', type: 'text', requiredOnCreate: true },
    { id: 'br_micro', alias: 'micro', label: 'Micro', type: 'number', numberOptions: { step: 1e-7 } },
  ],
}

const UUID_V4 = '550e8400-e29b-41d4-a716-446655440000'

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
    { id: 'br_title', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
    { id: 'br_author_id', alias: 'author_id', label: 'Author', type: 'relation', targetSeed: 'team' },
    { id: 'br_editor_id', alias: 'editor_id', label: 'Editor', type: 'relation', targetSeed: 'team', requiredOnCreate: true },
    { id: 'br_coauthor_ids', alias: 'coauthor_ids', label: 'Co-authors', type: 'relation', targetSeed: 'team', multiple: true },
  ],
}


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

  it('rejects string-form richtext input as invalid (JSON-only)', () => {
    const r = safeValidate({ ...validBase(), body: '<script>alert(1)</script>' })
    expect(r.details.some(d => d.field === 'body')).toBe(true)
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

  it('allows tag-like text content in a text node (render sink HTML-escapes it, not executable)', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '<script>alert(1)</script>' }] }],
    }
    const r = safeValidate({ ...validBase(), body: doc })
    expect(r.dangerousFields).not.toContain('body')
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

  // Regression: #147 — blocklist bypass via non-allowlisted node type carrying an event handler
  it('#147: flags a non-allowlisted node type used as an XSS vector (img onerror bypass style)', () => {
    const maliciousDoc = {
      type: 'doc',
      content: [{ type: 'svg', attrs: { onload: 'alert(1)' } }],
    }
    const r = safeValidate({ ...validBase(), body: maliciousDoc })
    expect(r.dangerousFields).toContain('body')
  })

  // Regression: #148 — protocol blocklist bypass via data:/vbscript:/obfuscated javascript:
  it('#148: rejects data:text/html, vbscript:, and control-char obfuscated javascript: protocols', () => {
    const makeDoc = (href: string) => ({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: 'click', marks: [{ type: 'link', attrs: { href } }] }],
      }],
    })
    expect(safeValidate({ ...validBase(), body: makeDoc('data:text/html;base64,x') }).dangerousFields).toContain('body')
    expect(safeValidate({ ...validBase(), body: makeDoc('vbscript:alert(1)') }).dangerousFields).toContain('body')
    expect(safeValidate({ ...validBase(), body: makeDoc('java\tscript:alert(1)') }).dangerousFields).toContain('body')
  })

  it('allows relative and fragment links with no protocol', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: 'click', marks: [{ type: 'link', attrs: { href: '/local/path#section' } }] }],
      }],
    }
    const r = safeValidate({ ...validBase(), body: doc })
    expect(r.dangerousFields).not.toContain('body')
  })

  // Regression: #149 — unbounded recursion DoS via deeply nested richtext content
  it('#149: flags deeply nested content past the depth cap without stack overflow', () => {
    let node: Record<string, unknown> = { type: 'paragraph', content: [{ type: 'text', text: 'leaf' }] }
    for (let i = 0; i < 60; i++) {
      node = { type: 'paragraph', content: [node] }
    }
    const doc = { type: 'doc', content: [node] }
    expect(() => safeValidate({ ...validBase(), body: doc })).not.toThrow()
    const r = safeValidate({ ...validBase(), body: doc })
    expect(r.dangerousFields).toContain('body')
  })

  it('fails fast on oversize payload before the sanitizing walk', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x'.repeat(50) }] }] }
    const r = safeValidate({ ...validBase(), body: doc }, { maxTextLength: 5 })
    expect(r.details.some(d => d.field === 'body' && d.expected.includes('richtext(max:5)'))).toBe(true)
  })

  // Regression: #179 — sanitizeRichtext() must remove dangerous content from `.value`,
  // not just flag it via `.dangerous` — a caller trusting `.value` alone must still be safe.
  it('#179: strips a non-allowlisted node type out of the sanitized `.value`, not just flags it', () => {
    const maliciousDoc = {
      type: 'doc',
      content: [
        { type: 'script', attrs: { src: 'http://evil.com' } },
        { type: 'paragraph', content: [{ type: 'text', text: 'safe' }] },
      ],
    }
    const r = sanitizeRichtext(maliciousDoc, 10000)
    expect(r.dangerous).toBe(true)
    expect(JSON.stringify(r.value)).not.toContain('script')
    const value = r.value as any
    expect(value.content).toHaveLength(1)
    expect(value.content[0].type).toBe('paragraph')
  })

  it('#179: strips the "on*" event-handler attribute out of the sanitized `.value`', () => {
    const maliciousDoc = {
      type: 'doc',
      content: [{ type: 'image', attrs: { src: 'https://x.com/a.png', onError: 'alert(1)' } }],
    }
    const r = sanitizeRichtext(maliciousDoc, 10000)
    expect(r.dangerous).toBe(true)
    const attrs = (r.value as any).content[0].attrs
    expect(attrs.onError).toBeUndefined()
    expect(attrs.src).toBe('https://x.com/a.png')
  })

  it('#179: strips a disallowed-protocol href out of the sanitized `.value`', () => {
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
    const r = sanitizeRichtext(maliciousDoc, 10000)
    expect(r.dangerous).toBe(true)
    const markAttrs = (r.value as any).content[0].content[0].marks[0].attrs
    expect(markAttrs.href).toBeUndefined()
  })

  it('#179: flags and strips a node whose `type` is a non-string (array bypass of the allowlist)', () => {
    const maliciousDoc = {
      type: 'doc',
      content: [{ type: ['iframe'], attrs: { src: 'https://evil.com' } }],
    }
    const r = sanitizeRichtext(maliciousDoc, 10000)
    expect(r.dangerous).toBe(true)
    expect((r.value as any).content).toHaveLength(0)
  })

  it('#179: flags a node whose `type` is a number (allowlist bypass)', () => {
    const maliciousDoc = {
      type: 'doc',
      content: [{ type: 42, attrs: { src: 'https://evil.com' } }],
    }
    const r = sanitizeRichtext(maliciousDoc, 10000)
    expect(r.dangerous).toBe(true)
    expect((r.value as any).content).toHaveLength(0)
  })

  it('prevents prototype pollution via __proto__, constructor, and prototype keys', () => {
    const maliciousDoc = JSON.parse(
      '{"type": "doc", "__proto__": {"polluted": "yes"}, "constructor": {"prototype": {"polluted": "yes"}}, "prototype": {"polluted": "yes"}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "hello"}]}]}'
    )
    const r = safeValidate({ ...validBase(), body: maliciousDoc })
    
    expect((Object.prototype as any).polluted).toBeUndefined()
    
    const bodyVal = r.data.body as any
    expect(bodyVal.__proto__).toBeUndefined()
    expect(bodyVal.constructor).toBeUndefined()
    expect(bodyVal.prototype).toBeUndefined()
  })
})

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