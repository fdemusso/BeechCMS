import { describe, it, expect } from 'vitest'
import { validateAndSanitizeSeedPayload, isValidContentStatus } from './index.js'
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

const DECIMAL_MIN_STEP_SEED: Seed = {
  slug: 'gauge',
  label: 'Gauge',
  displayNameAlias: 'sku',
  branches: [
    { id: 'br_sku', alias: 'sku', label: 'SKU', type: 'text', requiredOnCreate: true },
    { id: 'br_reading', alias: 'reading', label: 'Reading', type: 'number', numberOptions: { min: 0.5, step: 1 } },
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

describe('number field step ignoring min decimals (#176)', () => {
  it('accepts a value aligned to the min-offset grid', () => {
    const r = validateAndSanitizeSeedPayload(DECIMAL_MIN_STEP_SEED, { sku: 'A', reading: 1.5 }, { requireAtLeastOneValidField: true })
    expect(r.details.some(d => d.field === 'reading')).toBe(false)
  })

  it('rejects a value off the min-offset grid even when integer-valued', () => {
    const r = validateAndSanitizeSeedPayload(DECIMAL_MIN_STEP_SEED, { sku: 'A', reading: 1 }, { requireAtLeastOneValidField: true })
    expect(r.details.some(d => d.field === 'reading' && d.expected.includes('step:1'))).toBe(true)
  })
})

describe('number field step with scientific notation (#150)', () => {
  it('accepts a value aligned to a scientific-notation step', () => {
    const r = validateAndSanitizeSeedPayload(SCI_STEP_SEED, { sku: 'A', micro: 3e-7 }, { requireAtLeastOneValidField: true })
    expect(r.details.some(d => d.field === 'micro')).toBe(false)
  })

  it('rejects a value misaligned to a scientific-notation step', () => {
    const r = validateAndSanitizeSeedPayload(SCI_STEP_SEED, { sku: 'A', micro: 2.5e-7 }, { requireAtLeastOneValidField: true })
    expect(r.details.some(d => d.field === 'micro' && d.expected.includes('step:1e-7'))).toBe(true)
  })
})