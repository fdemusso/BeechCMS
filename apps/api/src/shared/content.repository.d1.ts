// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import {
  ContentRepository,
  EntryNotFoundError,
  RepositoryError,
  SlugConflictError,
  RelationTargetNotFoundError,
  type Seed,
  type Branch,
  type SelectOptions,
  buildSelectQuery,
  deserializeFromDb,
  serializeForDb,
} from '@beechcms/core'
import { BaseD1Repository } from './base.repository.d1'

// ── Private helpers ───────────────────────────────────────────────────────────

function multiRelBranches(seed: Seed): Branch[] {
  return seed.branches.filter(b => b.type === 'relation' && b.multiple === true)
}

function singleRelBranches(seed: Seed): Branch[] {
  return seed.branches.filter(b => b.type === 'relation' && !b.multiple)
}

function jTable(seedSlug: string, branchAlias: string): string {
  return `rel_${seedSlug}_${branchAlias}`
}

function jDraftTable(seedSlug: string, branchAlias: string): string {
  return `rel_${seedSlug}_${branchAlias}_drafts`
}

export class D1ContentRepository extends BaseD1Repository implements ContentRepository {
  /**
   * Deserializes a DB row using the Seed's branch definitions.
   * Skips multi-relation branches — their values come from junction tables.
   */
  private rowToData(seed: Seed, row: any): Record<string, any> {
    const data: Record<string, any> = {
      id: row.id,
      slug: row.slug,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }

    for (const branch of seed.branches) {
      // Multi-relation values live in junction tables, not as columns on this table
      if (branch.type === 'relation' && branch.multiple === true) continue
      if (Object.hasOwn(row, branch.alias)) {
        data[branch.alias] = deserializeFromDb(branch, row[branch.alias])
      }
    }

    return data
  }

  /**
   * Fetches multi-relation arrays for a single entry and attaches them to `data`.
   */
  private async attachMultiRelations(
    seed: Seed,
    entryId: string,
    data: Record<string, any>,
  ): Promise<void> {
    const branches = multiRelBranches(seed)
    if (branches.length === 0) return

    const stmts = branches.map(b =>
      this.database
        .prepare(`SELECT target_id FROM ${jTable(seed.slug, b.alias)} WHERE parent_id = ? ORDER BY position ASC`)
        .bind(entryId),
    )

    const results = await this.database.batch(stmts)
    for (let i = 0; i < branches.length; i++) {
      data[branches[i].alias] = (results[i].results ?? []).map((r: any) => r.target_id)
    }
  }

  /**
   * Fetches multi-relation arrays for a list of entries and attaches them.
   * One query per multi-relation branch (O(R) queries, R = branch count).
   */
  private async attachMultiRelationsMany(
    seed: Seed,
    entries: Record<string, any>[],
  ): Promise<void> {
    const branches = multiRelBranches(seed)
    if (branches.length === 0 || entries.length === 0) return

    const ids = entries.map(e => e.id)
    const placeholders = ids.map(() => '?').join(', ')

    const stmts = branches.map(b =>
      this.database
        .prepare(
          `SELECT parent_id, target_id FROM ${jTable(seed.slug, b.alias)}` +
          ` WHERE parent_id IN (${placeholders}) ORDER BY parent_id, position ASC`,
        )
        .bind(...ids),
    )

    const results = await this.database.batch(stmts)
    for (let i = 0; i < branches.length; i++) {
      const branch = branches[i]
      const byParent = new Map<string, string[]>()
      for (const row of results[i].results ?? []) {
        const r = row as Record<string, unknown>
        const pid = r.parent_id as string
        if (!byParent.has(pid)) byParent.set(pid, [])
        byParent.get(pid)!.push(r.target_id as string)
      }
      for (const entry of entries) {
        entry[branch.alias] = byParent.get(entry.id) ?? []
      }
    }
  }

  async findMany(
    seed: Seed,
    options: SelectOptions
  ): Promise<{ items: Record<string, any>[]; total: number }> {
    try {
      const { sql, bindings } = buildSelectQuery(seed, options)

      const countSql = sql
        .replace(/SELECT .* FROM/, 'SELECT COUNT(*) as total FROM')
        .replace(/ ORDER BY .*$/, '')
        .replace(/ LIMIT \? OFFSET \?$/, '')

      const countBindings = bindings.slice(0, bindings.length - (options.pagination ? 2 : 0))

      const [batchResults, totalCountResult] = await this.database.batch([
        this.database.prepare(sql).bind(...bindings),
        this.database.prepare(countSql).bind(...countBindings),
      ])

      const contentEntries = (batchResults.results || []).map(row => this.rowToData(seed, row))
      const totalEntriesCount = (totalCountResult.results?.[0] as any)?.total || 0

      await this.attachMultiRelationsMany(seed, contentEntries)

      return { items: contentEntries, total: totalEntriesCount }
    } catch (error) {
      throw this.mapError(error, `findMany(${seed.slug})`)
    }
  }

  async findById(seed: Seed, id: string): Promise<Record<string, any>> {
    try {
      const tableName = this.getTableName(seed.slug)
      const entryRow = await this.database
        .prepare(`SELECT * FROM ${tableName} WHERE id = ? LIMIT 1`)
        .bind(id)
        .first()

      if (!entryRow) {
        throw new EntryNotFoundError(`Entry ${id} not found in ${seed.slug}`)
      }

      const data = this.rowToData(seed, entryRow)
      await this.attachMultiRelations(seed, id, data)
      return data
    } catch (error) {
      if (error instanceof EntryNotFoundError) throw error
      throw this.mapError(error, `findById(${seed.slug}, ${id})`)
    }
  }

  async findBySlug(seed: Seed, slug: string): Promise<Record<string, any>> {
    try {
      const tableName = this.getTableName(seed.slug)
      const entryRow = await this.database
        .prepare(`SELECT * FROM ${tableName} WHERE slug = ? LIMIT 1`)
        .bind(slug)
        .first()

      if (!entryRow) {
        throw new EntryNotFoundError(`Entry with slug "${slug}" not found in ${seed.slug}`)
      }

      const data = this.rowToData(seed, entryRow)
      await this.attachMultiRelations(seed, entryRow.id as string, data)
      return data
    } catch (error) {
      if (error instanceof EntryNotFoundError) throw error
      throw this.mapError(error, `findBySlug(${seed.slug}, ${slug})`)
    }
  }

  async getFacets(seed: Seed): Promise<{
    statuses: Record<string, number>
    tagsByColumn: Record<string, string[]>
  }> {
    try {
      const tableName = this.getTableName(seed.slug)

      const statusResults = await this.database
        .prepare(`SELECT status, COUNT(*) as count FROM ${tableName} GROUP BY status`)
        .all()

      const statusesCount: Record<string, number> = {}
      for (const statusRow of statusResults.results || []) {
        statusesCount[statusRow.status as string] = statusRow.count as number
      }

      const tagsByColumn: Record<string, string[]> = {}
      const tagBranches = seed.branches.filter(branch => branch.type === 'tags')

      for (const branch of tagBranches) {
        const tagResults = await this.database
          .prepare(`SELECT DISTINCT value FROM ${tableName}, json_each(${tableName}.${branch.alias}) WHERE value IS NOT NULL`)
          .all()
        tagsByColumn[branch.alias] = (tagResults.results || []).map(row => row.value as string)
      }

      return { statuses: statusesCount, tagsByColumn }
    } catch (error) {
      throw this.mapError(error, `getFacets(${seed.slug})`)
    }
  }

  async existsSlug(seed: Seed, slug: string, excludeId?: string): Promise<boolean> {
    try {
      const tableName = this.getTableName(seed.slug)
      let sql = `SELECT 1 FROM ${tableName} WHERE slug = ?`
      const queryBindings: any[] = [slug]

      if (excludeId) {
        sql += ` AND id != ?`
        queryBindings.push(excludeId)
      }

      const entryExistsResult = await this.database.prepare(sql).bind(...queryBindings).first()
      return entryExistsResult !== null
    } catch (error) {
      throw this.mapError(error, `existsSlug(${seed.slug}, ${slug})`)
    }
  }

  async create(
    seed: Seed,
    id: string,
    slug: string,
    status: string,
    data: Record<string, any>
  ): Promise<void> {
    try {
      if (await this.existsSlug(seed, slug)) {
        throw new SlugConflictError(`Slug "${slug}" already exists for ${seed.slug}`)
      }

      const tableName = this.getTableName(seed.slug)
      const columnNames = ['id', 'slug', 'status']
      const placeholders = ['?', '?', '?']
      const queryBindings: any[] = [id, slug, status]

      const mRelBranches = multiRelBranches(seed)
      const mRelAliases = new Set(mRelBranches.map(b => b.alias))

      for (const branch of seed.branches) {
        if (mRelAliases.has(branch.alias)) continue
        if (Object.hasOwn(data, branch.alias)) {
          columnNames.push(branch.alias)
          placeholders.push('?')
          queryBindings.push(serializeForDb(branch, data[branch.alias]))
        }
      }

      const mainSql = `INSERT INTO ${tableName} (${columnNames.join(', ')}) VALUES (${placeholders.join(', ')})`

      // Build junction INSERT statements for multi-relation branches
      const batchStmts: D1PreparedStatement[] = [
        this.database.prepare(mainSql).bind(...queryBindings),
      ]

      for (const branch of mRelBranches) {
        const value = data[branch.alias]
        if (!Array.isArray(value) || value.length === 0) continue
        const jt = jTable(seed.slug, branch.alias)
        for (let i = 0; i < value.length; i++) {
          batchStmts.push(
            this.database
              .prepare(`INSERT INTO ${jt} (parent_id, target_id, position) VALUES (?, ?, ?)`)
              .bind(id, value[i], i),
          )
        }
      }

      if (batchStmts.length === 1) {
        await batchStmts[0].run()
      } else {
        await this.database.batch(batchStmts)
      }
    } catch (error) {
      if (error instanceof SlugConflictError) throw error
      throw this.mapError(error, `create(${seed.slug})`)
    }
  }

  async update(
    seed: Seed,
    id: string,
    data: Record<string, any>,
    status?: string
  ): Promise<void> {
    try {
      const tableName = this.getTableName(seed.slug)
      const updateClauses: string[] = []
      const queryBindings: any[] = []

      const mRelBranches = multiRelBranches(seed)
      const mRelAliases = new Set(mRelBranches.map(b => b.alias))

      if (status) {
        updateClauses.push('status = ?')
        queryBindings.push(status)
      }

      for (const branch of seed.branches) {
        if (mRelAliases.has(branch.alias)) continue
        if (Object.hasOwn(data, branch.alias)) {
          updateClauses.push(`${branch.alias} = ?`)
          queryBindings.push(serializeForDb(branch, data[branch.alias]))
        }
      }

      // Junction updates: only for multi-relation aliases present in data
      const junctionUpdates = mRelBranches.filter(b => Object.hasOwn(data, b.alias))

      if (updateClauses.length === 0 && junctionUpdates.length === 0) return

      // When only junction rows change, still bump updated_at for consistency
      if (updateClauses.length === 0 && junctionUpdates.length > 0) {
        updateClauses.push('updated_at = (unixepoch())')
      } else {
        updateClauses.push('updated_at = (unixepoch())')
      }

      const mainSql = `UPDATE ${tableName} SET ${updateClauses.join(', ')} WHERE id = ?`
      queryBindings.push(id)

      const batchStmts: D1PreparedStatement[] = [
        this.database.prepare(mainSql).bind(...queryBindings),
      ]

      for (const branch of junctionUpdates) {
        const jt = jTable(seed.slug, branch.alias)
        const value = (data[branch.alias] ?? []) as string[]
        // Full replace: DELETE + INSERT
        batchStmts.push(
          this.database.prepare(`DELETE FROM ${jt} WHERE parent_id = ?`).bind(id),
        )
        for (let i = 0; i < value.length; i++) {
          batchStmts.push(
            this.database
              .prepare(`INSERT INTO ${jt} (parent_id, target_id, position) VALUES (?, ?, ?)`)
              .bind(id, value[i], i),
          )
        }
      }

      if (batchStmts.length === 1) {
        const updateResult = await batchStmts[0].run()
        if (updateResult.meta.changes === 0) {
          throw new EntryNotFoundError(`Entry ${id} not found in ${seed.slug}`)
        }
      } else {
        const results = await this.database.batch(batchStmts)
        if ((results[0].meta?.changes ?? 0) === 0) {
          throw new EntryNotFoundError(`Entry ${id} not found in ${seed.slug}`)
        }
      }
    } catch (error) {
      if (error instanceof EntryNotFoundError) throw error
      throw this.mapError(error, `update(${seed.slug}, ${id})`)
    }
  }

  async delete(seed: Seed, id: string): Promise<{ row: Record<string, any> }> {
    try {
      const tableName = this.getTableName(seed.slug)

      const entryRow = await this.database
        .prepare(`SELECT * FROM ${tableName} WHERE id = ?`)
        .bind(id)
        .first()

      if (!entryRow) {
        throw new EntryNotFoundError(`Entry ${id} not found in ${seed.slug}`)
      }

      await this.database.prepare(`DELETE FROM ${tableName} WHERE id = ?`).bind(id).run()

      return { row: this.rowToData(seed, entryRow) }
    } catch (error) {
      if (error instanceof EntryNotFoundError) throw error
      throw this.mapError(error, `delete(${seed.slug}, ${id})`)
    }
  }

  async saveDraft(seed: Seed, entryId: string, data: Record<string, any>): Promise<void> {
    try {
      if (!seed.allowDrafts) {
        throw new RepositoryError(`Drafts not allowed for ${seed.slug}`)
      }

      const draftTableName = this.getTableName(seed.slug, true)
      const mRelBranches = multiRelBranches(seed)
      const mRelAliases = new Set(mRelBranches.map(b => b.alias))

      const columnNames = ['entry_id']
      const placeholders = ['?']
      const queryBindings: any[] = [entryId]
      const updateClauses: string[] = []

      for (const branch of seed.branches) {
        if (mRelAliases.has(branch.alias)) continue
        if (Object.hasOwn(data, branch.alias)) {
          const serializedValue = serializeForDb(branch, data[branch.alias])
          columnNames.push(branch.alias)
          placeholders.push('?')
          queryBindings.push(serializedValue)
          updateClauses.push(`${branch.alias} = EXCLUDED.${branch.alias}`)
        }
      }

      updateClauses.push('updated_at = (unixepoch())')

      const sql = `
        INSERT INTO ${draftTableName} (${columnNames.join(', ')})
        VALUES (${placeholders.join(', ')})
        ON CONFLICT(entry_id) DO UPDATE SET ${updateClauses.join(', ')}
      `

      const junctionUpdates = mRelBranches.filter(b => Object.hasOwn(data, b.alias))

      if (junctionUpdates.length === 0) {
        await this.database.prepare(sql).bind(...queryBindings).run()
        return
      }

      const batchStmts: D1PreparedStatement[] = [
        this.database.prepare(sql).bind(...queryBindings),
      ]

      for (const branch of junctionUpdates) {
        const jdt = jDraftTable(seed.slug, branch.alias)
        const value = (data[branch.alias] ?? []) as string[]
        batchStmts.push(
          this.database.prepare(`DELETE FROM ${jdt} WHERE entry_id = ?`).bind(entryId),
        )
        for (let i = 0; i < value.length; i++) {
          batchStmts.push(
            this.database
              .prepare(`INSERT INTO ${jdt} (entry_id, target_id, position) VALUES (?, ?, ?)`)
              .bind(entryId, value[i], i),
          )
        }
      }

      await this.database.batch(batchStmts)
    } catch (error) {
      throw this.mapError(error, `saveDraft(${seed.slug}, ${entryId})`)
    }
  }

  async getDraft(seed: Seed, entryId: string): Promise<Record<string, any> | null> {
    try {
      if (!seed.allowDrafts) return null

      const draftTableName = this.getTableName(seed.slug, true)
      const draftRow = await this.database
        .prepare(`SELECT * FROM ${draftTableName} WHERE entry_id = ?`)
        .bind(entryId)
        .first()

      if (!draftRow) return null

      const mRelBranches = multiRelBranches(seed)
      const mRelAliases = new Set(mRelBranches.map(b => b.alias))

      const draftData: Record<string, any> = {}
      for (const branch of seed.branches) {
        if (mRelAliases.has(branch.alias)) continue
        if (draftRow[branch.alias] !== null) {
          draftData[branch.alias] = deserializeFromDb(branch, draftRow[branch.alias])
        }
      }

      // Fetch multi-relation draft arrays from junction draft tables
      if (mRelBranches.length > 0) {
        const stmts = mRelBranches.map(b =>
          this.database
            .prepare(`SELECT target_id FROM ${jDraftTable(seed.slug, b.alias)} WHERE entry_id = ? ORDER BY position ASC`)
            .bind(entryId),
        )
        const results = await this.database.batch(stmts)
        for (let i = 0; i < mRelBranches.length; i++) {
          const ids = (results[i].results ?? []).map((r: any) => r.target_id as string)
          if (ids.length > 0) {
            draftData[mRelBranches[i].alias] = ids
          }
        }
      }

      return draftData
    } catch (error) {
      throw this.mapError(error, `getDraft(${seed.slug}, ${entryId})`)
    }
  }

  async hasDraft(seed: Seed, entryId: string): Promise<boolean> {
    try {
      if (!seed.allowDrafts) return false
      const draftTableName = this.getTableName(seed.slug, true)
      const draftExistsResult = await this.database
        .prepare(`SELECT 1 FROM ${draftTableName} WHERE entry_id = ? LIMIT 1`)
        .bind(entryId)
        .first()
      return draftExistsResult !== null
    } catch (error) {
      throw this.mapError(error, `hasDraft(${seed.slug}, ${entryId})`)
    }
  }

  async publishDraft(seed: Seed, entryId: string): Promise<void> {
    try {
      if (!seed.allowDrafts) return

      const draftTableName = this.getTableName(seed.slug, true)
      const liveTableName = this.getTableName(seed.slug)

      const draftRow = await this.database
        .prepare(`SELECT * FROM ${draftTableName} WHERE entry_id = ?`)
        .bind(entryId)
        .first<Record<string, unknown>>()

      if (!draftRow) {
        throw new EntryNotFoundError(`No draft found for ${entryId} in ${seed.slug}`)
      }

      // ── Pre-validate single-value relation branches ──────────────────────
      for (const branch of singleRelBranches(seed)) {
        const value = draftRow[branch.alias]
        if (value == null) continue
        const exists = await this.database
          .prepare(`SELECT 1 FROM content_${branch.targetSeed} WHERE id = ? LIMIT 1`)
          .bind(value)
          .first()
        if (!exists) {
          throw new RelationTargetNotFoundError({
            alias: branch.alias,
            targetSeed: branch.targetSeed!,
            value: String(value),
          })
        }
      }

      // ── Pre-validate multi-relation branches + collect draft ids ─────────
      const mRelBranches = multiRelBranches(seed)
      const mRelDraftIds = new Map<string, string[]>()

      for (const branch of mRelBranches) {
        const jdt = jDraftTable(seed.slug, branch.alias)
        const rows = await this.database
          .prepare(`SELECT target_id FROM ${jdt} WHERE entry_id = ? ORDER BY position ASC`)
          .bind(entryId)
          .all()
        const targetIds = (rows.results ?? []).map((r: any) => r.target_id as string)

        for (const targetId of targetIds) {
          const exists = await this.database
            .prepare(`SELECT 1 FROM content_${branch.targetSeed} WHERE id = ? LIMIT 1`)
            .bind(targetId)
            .first()
          if (!exists) {
            throw new RelationTargetNotFoundError({
              alias: branch.alias,
              targetSeed: branch.targetSeed!,
              value: targetId,
            })
          }
        }
        mRelDraftIds.set(branch.alias, targetIds)
      }

      // ── Build UPDATE clause for live table ───────────────────────────────
      const mRelAliases = new Set(mRelBranches.map(b => b.alias))
      const updateClauses: string[] = []
      const queryBindings: any[] = []

      for (const branch of seed.branches) {
        if (mRelAliases.has(branch.alias)) continue
        if (draftRow[branch.alias] !== null) {
          updateClauses.push(`${branch.alias} = ?`)
          queryBindings.push(draftRow[branch.alias])
        }
      }

      updateClauses.push('updated_at = (unixepoch())')
      const updateSql = `UPDATE ${liveTableName} SET ${updateClauses.join(', ')} WHERE id = ?`
      queryBindings.push(entryId)

      // ── Atomic batch: update live, delete draft, promote junction rows ────
      const batchStmts: D1PreparedStatement[] = [
        this.database.prepare(updateSql).bind(...queryBindings),
        this.database.prepare(`DELETE FROM ${draftTableName} WHERE entry_id = ?`).bind(entryId),
      ]

      for (const branch of mRelBranches) {
        const lt = jTable(seed.slug, branch.alias)
        const jdt = jDraftTable(seed.slug, branch.alias)
        const targetIds = mRelDraftIds.get(branch.alias) ?? []

        batchStmts.push(
          this.database.prepare(`DELETE FROM ${lt} WHERE parent_id = ?`).bind(entryId),
        )
        batchStmts.push(
          this.database.prepare(`DELETE FROM ${jdt} WHERE entry_id = ?`).bind(entryId),
        )
        for (let i = 0; i < targetIds.length; i++) {
          batchStmts.push(
            this.database
              .prepare(`INSERT INTO ${lt} (parent_id, target_id, position) VALUES (?, ?, ?)`)
              .bind(entryId, targetIds[i], i),
          )
        }
      }

      await this.database.batch(batchStmts)
    } catch (error) {
      if (error instanceof EntryNotFoundError) throw error
      if (error instanceof RelationTargetNotFoundError) throw error
      throw this.mapError(error, `publishDraft(${seed.slug}, ${entryId})`)
    }
  }

  async deleteDraft(seed: Seed, entryId: string): Promise<void> {
    try {
      if (!seed.allowDrafts) return
      const draftTableName = this.getTableName(seed.slug, true)
      await this.database.prepare(`DELETE FROM ${draftTableName} WHERE entry_id = ?`).bind(entryId).run()
    } catch (error) {
      throw this.mapError(error, `deleteDraft(${seed.slug}, ${entryId})`)
    }
  }
}
