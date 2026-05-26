// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { Seed } from '@beechcms/core'
import { getExpectedColumns, type SchemaColumn } from '@beechcms/core'
import type { WranglerOptions, D1Row } from './wrangler.js'
import { queryD1 } from './wrangler.js'

interface PragmaRow extends D1Row {
  name: string
  type: string
  notnull: number
  pk: number
}

export interface ColumnDiff {
  name: string
  status: 'ok' | 'missing' | 'extra' | 'type_mismatch'
  expectedType?: string
  actualType?: string
}

export interface SeedDiff {
  slug: string
  tableExists: boolean
  columns: ColumnDiff[]
}

export async function diffSeed(seed: Seed, options: WranglerOptions): Promise<SeedDiff> {
  const tableName = `content_${seed.slug}`
  const expected = getExpectedColumns(seed)

  let actual: PragmaRow[]
  try {
    actual = queryD1<PragmaRow>(`PRAGMA table_info(${tableName})`, options)
  } catch {
    return { slug: seed.slug, tableExists: false, columns: expected.map(c => ({ name: c.name, status: 'missing', expectedType: c.sqlType })) }
  }

  if (actual.length === 0) {
    return { slug: seed.slug, tableExists: false, columns: expected.map(c => ({ name: c.name, status: 'missing', expectedType: c.sqlType })) }
  }

  const actualMap = new Map<string, PragmaRow>(actual.map(r => [r.name, r]))
  const expectedSet = new Set<string>(expected.map(c => c.name))

  const columns: ColumnDiff[] = []

  for (const col of expected) {
    const actual = actualMap.get(col.name)
    if (!actual) {
      columns.push({ name: col.name, status: 'missing', expectedType: col.sqlType })
    } else if (actual.type.toUpperCase() !== col.sqlType) {
      columns.push({ name: col.name, status: 'type_mismatch', expectedType: col.sqlType, actualType: actual.type })
    } else {
      columns.push({ name: col.name, status: 'ok' })
    }
  }

  for (const row of actual) {
    if (!expectedSet.has(row.name)) {
      columns.push({ name: row.name, status: 'extra', actualType: row.type })
    }
  }

  return { slug: seed.slug, tableExists: true, columns }
}
