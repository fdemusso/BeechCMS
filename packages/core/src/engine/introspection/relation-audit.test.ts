// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import type { Seed } from '../types.js'
import type { SchemaQueryExecutor } from './introspection.js'
import { auditRelationStorage } from './relation-audit.js'

type Rows = Record<string, unknown>[]

/** Unstubbed statements fail loudly so a test cannot pass against SQL the audit stopped issuing. */
function fakeExecutor(responses: Record<string, Rows>): SchemaQueryExecutor {
  return {
    all: <T extends Record<string, unknown>>(sql: string): Promise<T[]> => {
      const rows = responses[sql]
      if (!rows) return Promise.reject(new Error(`unstubbed statement: ${sql}`))
      return Promise.resolve(rows as T[])
    },
  }
}

const col = (name: string, cid = 0): Record<string, unknown> => ({ cid, name, type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 })
const fk = (from: string, table: string, onDelete: string): Record<string, unknown> =>
  ({ id: 0, seq: 0, table, from, to: 'id', on_update: 'NO ACTION', on_delete: onDelete })

function tableStubs(name: string, columns: string[], fks: Rows = []): Record<string, Rows> {
  return {
    [`PRAGMA table_info(${name})`]: columns.map(col),
    [`PRAGMA foreign_key_list(${name})`]: fks,
    [`PRAGMA index_list(${name})`]: [],
  }
}

const absent = (name: string): Record<string, Rows> => ({ [`PRAGMA table_info(${name})`]: [] })

const seedWith = (branch: Seed['branches'][number], allowDrafts = false): Seed => ({
  slug: 'posts',
  label: 'Posts',
  displayNameAlias: 'title',
  allowDrafts,
  branches: [branch],
})

describe('auditRelationStorage', () => {
  it('reports no finding for a single relation whose column and FK match the definition', async () => {
    const seed = seedWith({ id: 'br_01', alias: 'author_id', label: 'Author', type: 'relation', targetSeed: 'authors' })
    const executor = fakeExecutor({
      ...tableStubs('content_posts', ['id', 'author_id'], [fk('author_id', 'content_authors', 'SET NULL')]),
      ...absent('rel_posts_author_id'),
      ...absent('rel_posts_author_id_drafts'),
    })

    const findings = await auditRelationStorage(executor, [seed])

    expect(findings).toEqual([])
  })

  it('reports no finding for a multiple relation with a matching junction FK and a drafts junction', async () => {
    const seed = seedWith({ id: 'br_01', alias: 'tags', label: 'Tags', type: 'relation', targetSeed: 'tags', multiple: true }, true)
    const executor = fakeExecutor({
      ...tableStubs('content_posts', ['id']),
      ...tableStubs('rel_posts_tags', ['parent_id', 'target_id'], [fk('target_id', 'content_tags', 'CASCADE')]),
      ...tableStubs('rel_posts_tags_drafts', ['entry_id', 'target_id']),
    })

    const findings = await auditRelationStorage(executor, [seed])

    expect(findings).toEqual([])
  })

  it('reports missing_storage when a multiple relation has no junction table', async () => {
    const seed = seedWith({ id: 'br_01', alias: 'tags', label: 'Tags', type: 'relation', targetSeed: 'tags', multiple: true })
    const executor = fakeExecutor({
      ...tableStubs('content_posts', ['id']),
      ...absent('rel_posts_tags'),
      ...absent('rel_posts_tags_drafts'),
    })

    const findings = await auditRelationStorage(executor, [seed])

    expect(findings).toEqual([expect.objectContaining({ alias: 'tags', issue: 'missing_storage', strandedRows: 0 })])
  })

  it('reports missing_storage when a drafts junction is absent for a drafts-enabled seed', async () => {
    const seed = seedWith({ id: 'br_01', alias: 'tags', label: 'Tags', type: 'relation', targetSeed: 'tags', multiple: true }, true)
    const executor = fakeExecutor({
      ...tableStubs('content_posts', ['id']),
      ...tableStubs('rel_posts_tags', ['parent_id', 'target_id'], [fk('target_id', 'content_tags', 'CASCADE')]),
      ...absent('rel_posts_tags_drafts'),
    })

    const findings = await auditRelationStorage(executor, [seed])

    expect(findings).toEqual([expect.objectContaining({ alias: 'tags', issue: 'missing_storage', expected: 'drafts junction rel_posts_tags_drafts' })])
  })

  it('counts only non-null values of a stale column when a multiple relation still has the FK column', async () => {
    const seed = seedWith({ id: 'br_01', alias: 'tags', label: 'Tags', type: 'relation', targetSeed: 'tags', multiple: true })
    const executor = fakeExecutor({
      ...tableStubs('content_posts', ['id', 'tags']),
      ...tableStubs('rel_posts_tags', ['parent_id', 'target_id'], [fk('target_id', 'content_tags', 'CASCADE')]),
      ...absent('rel_posts_tags_drafts'),
      'SELECT COUNT(*) AS n FROM content_posts WHERE "tags" IS NOT NULL': [{ n: 3 }],
    })

    const findings = await auditRelationStorage(executor, [seed])

    expect(findings).toEqual([expect.objectContaining({ alias: 'tags', issue: 'wrong_storage', strandedRows: 3 })])
  })

  it('sums main and drafts junction rows when a single relation still has junction tables', async () => {
    const seed = seedWith({ id: 'br_01', alias: 'author_id', label: 'Author', type: 'relation', targetSeed: 'authors' }, true)
    const executor = fakeExecutor({
      ...tableStubs('content_posts', ['id', 'author_id'], [fk('author_id', 'content_authors', 'SET NULL')]),
      ...tableStubs('rel_posts_author_id', ['parent_id', 'target_id']),
      ...tableStubs('rel_posts_author_id_drafts', ['entry_id', 'target_id']),
      'SELECT COUNT(*) AS n FROM rel_posts_author_id': [{ n: 2 }],
      'SELECT COUNT(*) AS n FROM rel_posts_author_id_drafts': [{ n: 5 }],
    })

    const findings = await auditRelationStorage(executor, [seed])

    expect(findings).toEqual([expect.objectContaining({ alias: 'author_id', issue: 'wrong_storage', strandedRows: 7 })])
  })

  it('reports both fk_target_mismatch and fk_on_delete_mismatch when the FK differs on both axes', async () => {
    const seed = seedWith({ id: 'br_01', alias: 'author_id', label: 'Author', type: 'relation', targetSeed: 'authors', onDelete: 'RESTRICT' })
    const executor = fakeExecutor({
      ...tableStubs('content_posts', ['id', 'author_id'], [fk('author_id', 'content_categories', 'SET NULL')]),
      ...absent('rel_posts_author_id'),
      ...absent('rel_posts_author_id_drafts'),
    })

    const findings = await auditRelationStorage(executor, [seed])

    expect(findings.map(finding => finding.issue)).toEqual(['fk_target_mismatch', 'fk_on_delete_mismatch'])
  })

  it('skips a seed whose content table does not exist, since that is plain schema drift', async () => {
    const seed = seedWith({ id: 'br_01', alias: 'author_id', label: 'Author', type: 'relation', targetSeed: 'authors' })
    const executor = fakeExecutor({ ...absent('content_posts') })

    const findings = await auditRelationStorage(executor, [seed])

    expect(findings).toEqual([])
  })

  it('rejects a branch alias that is not a plain SQL identifier before any statement is built from it', async () => {
    const seed = seedWith({ id: 'br_01', alias: 'a"; DROP TABLE x;--', label: 'Bad', type: 'relation', targetSeed: 'authors' })
    const executor = fakeExecutor({ ...tableStubs('content_posts', ['id']) })

    await expect(auditRelationStorage(executor, [seed])).rejects.toThrow(/not a plain SQL identifier/)
  })
})
