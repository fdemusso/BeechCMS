import { describe, it, expect } from 'vitest'
import { compileSeedSchema } from './cache.js'
import type { ResolvedOptions } from './index.js'
import type { Seed } from '../types.js'
import type { IIdGenerator } from '../../common/id-generator.js'

const RELATION_SEED: Seed = {
  slug: 'articles',
  label: 'Article',
  displayNameAlias: 'title',
  branches: [
    { id: 'br_title', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
    { id: 'br_author_id', alias: 'author_id', label: 'Author', type: 'relation', targetSeed: 'team' },
  ],
}

const PLAIN_SEED: Seed = {
  slug: 'notes',
  label: 'Note',
  displayNameAlias: 'title',
  branches: [
    { id: 'br_title', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
  ],
}

const uuidGen: IIdGenerator = {
  uuid: () => '550e8400-e29b-41d4-a716-446655440000',
  isValid: (v): v is string =>
    typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
}

const numericGen: IIdGenerator = {
  uuid: () => '42',
  isValid: (v): v is string => typeof v === 'string' && /^[0-9]+$/.test(v),
}

function baseOptions(idGenerator?: IIdGenerator): ResolvedOptions {
  return {
    allowNull: false,
    operation: 'create',
    requireAtLeastOneValidField: true,
    enforceRequiredFields: true,
    maxTextLength: 50_000,
    idGenerator,
  }
}

describe('compileSeedSchema caching', () => {
  it('caches relation-seed schemas instead of recompiling on every call', () => {
    const options = baseOptions(uuidGen)
    const first = compileSeedSchema(RELATION_SEED, options)
    const second = compileSeedSchema(RELATION_SEED, options)
    expect(second).toBe(first)
  })

  it('partitions relation-seed cache per idGenerator instance', () => {
    const uuidSchema = compileSeedSchema(RELATION_SEED, baseOptions(uuidGen))
    const numericSchema = compileSeedSchema(RELATION_SEED, baseOptions(numericGen))

    expect(numericSchema).not.toBe(uuidSchema)

    const payload = { title: 'Hello', author_id: '550e8400-e29b-41d4-a716-446655440000' }
    expect(uuidSchema.safeParse(payload).success).toBe(true)
    expect(numericSchema.safeParse(payload).success).toBe(false)

    // Re-fetching each generator's cached schema must not have cross-contaminated.
    const uuidSchemaAgain = compileSeedSchema(RELATION_SEED, baseOptions(uuidGen))
    expect(uuidSchemaAgain.safeParse(payload).success).toBe(true)
  })

  it('still caches relation-free seed schemas', () => {
    const first = compileSeedSchema(PLAIN_SEED, baseOptions())
    const second = compileSeedSchema(PLAIN_SEED, baseOptions())
    expect(second).toBe(first)
  })
})
