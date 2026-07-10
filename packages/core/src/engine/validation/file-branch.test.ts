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
    // file with maxSize
    { id: 'br_thumb', alias: 'thumb',       label: 'Thumb',       type: 'file', fileOptions: { maxSize: 1024 } },
    { id: 'br_photos', alias: 'photos',      label: 'Photos',      type: 'file', multiple: true, format: 'asset-list', fileOptions: { maxSize: 1024 } },
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

    const r3 = safeValidate({ ...validBase(), cover: 'httpx://server/file.zip' })
    expect(r3.details.some(d => d.field === 'cover')).toBe(true)

    const r4 = safeValidate({ ...validBase(), cover: 'http-foo://server/file.zip' })
    expect(r4.details.some(d => d.field === 'cover')).toBe(true)
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

describe('fileOptions.maxSize', () => {
  it('single: accepts a rich media object within the configured maxSize', () => {
    const r = safeValidate({ ...validBase(), thumb: { url: 'https://a.com/t.png', size: 1024 } })
    expect(r.data.thumb).toBe('https://a.com/t.png')
    expect(r.details.some(d => d.field === 'thumb')).toBe(false)
  })

  it('single: rejects a rich media object exceeding the configured maxSize', () => {
    const r = safeValidate({ ...validBase(), thumb: { url: 'https://a.com/t.png', size: 2048 } })
    expect(r.details.some(d => d.field === 'thumb' && d.expected.includes('maxSize'))).toBe(true)
  })

  it('single: falls back to the 5MB default when maxSize is not configured', () => {
    const withinDefault = safeValidate({ ...validBase(), cover: { url: 'https://a.com/c.png', size: 5 * 1024 * 1024 } })
    expect(withinDefault.details.some(d => d.field === 'cover')).toBe(false)

    const overDefault = safeValidate({ ...validBase(), cover: { url: 'https://a.com/c.png', size: 5 * 1024 * 1024 + 1 } })
    expect(overDefault.details.some(d => d.field === 'cover' && d.expected.includes('maxSize'))).toBe(true)
  })

  it('single: plain url string with no size metadata is not blocked by maxSize', () => {
    const r = safeValidate({ ...validBase(), thumb: 'https://a.com/t.png' })
    expect(r.details.some(d => d.field === 'thumb')).toBe(false)
  })

  it('asset-list: rejects an item exceeding the configured maxSize', () => {
    const r = safeValidate({
      ...validBase(),
      photos: [{ url: 'https://a.com/1.jpg', size: 512 }, { url: 'https://a.com/2.jpg', size: 4096 }],
    })
    expect(r.details.some(d => d.field === 'photos' && d.expected.includes('maxSize'))).toBe(true)
  })

  it('asset-list: accepts every item within the configured maxSize', () => {
    const r = safeValidate({
      ...validBase(),
      photos: [{ url: 'https://a.com/1.jpg', size: 512 }, { url: 'https://a.com/2.jpg', size: 1024 }],
    })
    expect(r.data.photos).toEqual(['https://a.com/1.jpg', 'https://a.com/2.jpg'])
  })
})

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
      branches: [{ id: 'br_file', alias: 'file', label: 'File', type: 'file', fileOptions: { accept: 'image' } }],
    }
    const seedAny: Seed = {
      slug: 'cache-test',
      label: 'Cache Test',
      displayNameAlias: 'file',
      branches: [{ id: 'br_file', alias: 'file', label: 'File', type: 'file', fileOptions: { accept: 'any' } }],
    }
    const zipUrl = 'https://x.com/archive.zip'
    const rImage = validateAndSanitizeSeedPayload(seedImage, { file: zipUrl }, { requireAtLeastOneValidField: true })
    const rAny = validateAndSanitizeSeedPayload(seedAny, { file: zipUrl }, { requireAtLeastOneValidField: true })
    expect(rImage.details.some(d => d.field === 'file')).toBe(true)
    expect(rAny.data.file).toBe(zipUrl)
  })
})

describe('#184 — collectAssetListItems cap (#10)', () => {
  it('rejects an asset-list array with more than 100 items', () => {
    const urls = Array.from({ length: 101 }, (_, i) => `https://cdn.example.com/img-${i}.jpg`)
    const r = safeValidate({ ...validBase(), gallery: urls })
    expect(r.details.some(d => d.field === 'gallery')).toBe(true)
    expect(r.data).not.toHaveProperty('gallery')
  })

  it('accepts an asset-list array with exactly 100 items', () => {
    const urls = Array.from({ length: 100 }, (_, i) => `https://cdn.example.com/img-${i}.jpg`)
    const r = safeValidate({ ...validBase(), gallery: urls })
    expect(r.details.some(d => d.field === 'gallery')).toBe(false)
    expect((r.data.gallery as string[]).length).toBe(100)
  })
})