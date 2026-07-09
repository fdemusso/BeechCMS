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

  const richtextDoc = (text: string) => ({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  })

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

describe('repeater field', () => {
  
  it('accepts a valid array of items', () => {
    const r = validateRepeater({
      title: 'My FAQ',
      items: [
        { question: 'Q1', answer: richtextDoc('A1'), order: 1 },
        { question: 'Q2', answer: richtextDoc('A2'), order: 2 },
      ],
    })
    expect(r.details).toEqual([])
    expect(r.data.items).toEqual([
      { question: 'Q1', answer: richtextDoc('A1'), order: 1 },
      { question: 'Q2', answer: richtextDoc('A2'), order: 2 },
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
      items: [{ question: 'Q1', answer: richtextDoc('A1'), order: 1, legacyAlias: 'old-data' }],
    })
    expect(r.details).toEqual([])
    expect(r.data.items).toEqual([{ question: 'Q1', answer: richtextDoc('A1'), order: 1 }])
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

  it('does not cache-collide when enforceRequiredFields option differs', () => {
    const seed: Seed = {
      slug: 'cache-test-required-fields',
      label: 'Cache Test Required Fields',
      displayNameAlias: 'title',
      branches: [
        { id: 'br_title', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
      ],
    }

    // Call A: enforceRequiredFields = true (default) -> field is required.
    // If it's missing, it fails because it's required.
    const rA = validateAndSanitizeSeedPayload(seed, {}, { operation: 'create', enforceRequiredFields: true, requireAtLeastOneValidField: false })
    expect(rA.details.some(d => d.field === 'title')).toBe(true)

    // Call B: enforceRequiredFields = false -> field is optional, should pass without issues.
    const rB = validateAndSanitizeSeedPayload(seed, {}, { operation: 'create', enforceRequiredFields: false, requireAtLeastOneValidField: false })
    expect(rB.details).toEqual([])
  })
})

// Regression: https://github.com/ (issue #152) — empty string on a nullable field
// must resolve to `null`, not be rejected by the `withNullable` union.
describe('empty string on nullable fields (issue #152)', () => {
  function validate(payload: Record<string, unknown>) {
    return validateAndSanitizeSeedPayload(
      CHAOS_SEED,
      { title: 'Valid Title', qty: 1, ...payload },
      { operation: 'update', allowNull: true, requireAtLeastOneValidField: false },
    )
  }

  it('number: "" resolves to null', () => {
    const r = validate({ price: '' })
    expect(r.details.some(d => d.field === 'price')).toBe(false)
    expect(r.data.price).toBeNull()
  })

  it('boolean: "" resolves to null', () => {
    const r = validate({ active: '' })
    expect(r.details.some(d => d.field === 'active')).toBe(false)
    expect(r.data.active).toBeNull()
  })

  it('date: "" resolves to null', () => {
    const r = validate({ publishedAt: '' })
    expect(r.details.some(d => d.field === 'publishedAt')).toBe(false)
    expect(r.data.publishedAt).toBeNull()
  })

  it('json: "" resolves to null', () => {
    const r = validate({ meta: '' })
    expect(r.details.some(d => d.field === 'meta')).toBe(false)
    expect(r.data.meta).toBeNull()
  })

  it('file: "" resolves to null', () => {
    const r = validate({ cover: '' })
    expect(r.details.some(d => d.field === 'cover')).toBe(false)
    expect(r.data.cover).toBeNull()
  })

  it('file (asset-list): "" resolves to null', () => {
    const r = validate({ gallery: '' })
    expect(r.details.some(d => d.field === 'gallery')).toBe(false)
    expect(r.data.gallery).toBeNull()
  })

  it('repeater: "" resolves to null', () => {
    const r = validateAndSanitizeSeedPayload(
      REPEATER_SEED,
      { title: 'My FAQ', items: '' },
      { operation: 'update', allowNull: true, requireAtLeastOneValidField: false },
    )
    expect(r.details.some(d => d.field === 'items')).toBe(false)
    expect(r.data.items).toBeNull()
  })

  it('number: null still resolves to null (no regression)', () => {
    const r = validate({ price: null })
    expect(r.details.some(d => d.field === 'price')).toBe(false)
    expect(r.data.price).toBeNull()
  })

  it('number: "" is rejected when allowNull is false', () => {
    const r = validateAndSanitizeSeedPayload(
      CHAOS_SEED,
      { title: 'Valid Title', qty: 1, price: '' },
      { operation: 'update', allowNull: false, requireAtLeastOneValidField: false },
    )
    expect(r.data.price).toBeUndefined()
  })
})