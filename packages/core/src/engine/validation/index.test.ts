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


describe('unhandled branch type', () => {
  it('throws a descriptive error for an unrecognized branch type', () => {
    const badSeed: Seed = {
      slug: 'broken',
      label: 'Broken',
      displayNameAlias: 'x',
      branches: [
        { id: 'br_x', alias: 'x', label: 'X', type: 'mystery' } as unknown as Branch,
      ],
    }
    expect(() => validateAndSanitizeSeedPayload(badSeed, { x: 'value' })).toThrow('Unhandled branch type')
  })
})

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