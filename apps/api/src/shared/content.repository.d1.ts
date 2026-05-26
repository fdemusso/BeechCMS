// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import {
  ContentRepository,
  EntryNotFoundError,
  RepositoryError,
  SlugConflictError,
  Seed,
  SelectOptions,
  buildSelectQuery,
  deserializeFromDb,
  serializeForDb,
} from '@beechcms/core'
import { BaseD1Repository } from './base.repository.d1'

export class D1ContentRepository extends BaseD1Repository implements ContentRepository {
  /**
   * Helper to deserialize a DB row using the Seed's branch definitions.
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
      if (Object.hasOwn(row, branch.alias)) {
        data[branch.alias] = deserializeFromDb(branch, row[branch.alias])
      }
    }

    return data
  }

  async findMany(
    seed: Seed,
    options: SelectOptions
  ): Promise<{ items: Record<string, any>[]; total: number }> {
    try {
      const { sql, bindings } = buildSelectQuery(seed, options)
      
      // We need the total count for pagination. 
      // We build a count query by replacing the SELECT part.
      // Note: buildSelectQuery might have joins and where clauses.
      const countSql = sql
        .replace(/SELECT .* FROM/, 'SELECT COUNT(*) as total FROM')
        .replace(/ ORDER BY .*$/, '')
        .replace(/ LIMIT \? OFFSET \?$/, '')
      
      const countBindings = bindings.slice(0, bindings.length - (options.pagination ? 2 : 0))

      const [batchResults, totalCountResult] = await this.database.batch([
        this.database.prepare(sql).bind(...bindings),
        this.database.prepare(countSql).bind(...countBindings)
      ])

      const contentEntries = (batchResults.results || []).map((entryRow) => this.rowToData(seed, entryRow))
      const totalEntriesCount = (totalCountResult.results?.[0] as any)?.total || 0

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

      return this.rowToData(seed, entryRow)
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

      return this.rowToData(seed, entryRow)
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
      
      // Retrieve count per status
      const statusResults = await this.database
        .prepare(`SELECT status, COUNT(*) as count FROM ${tableName} GROUP BY status`)
        .all()
      
      const statusesCount: Record<string, number> = {}
      for (const statusRow of statusResults.results || []) {
        statusesCount[statusRow.status as string] = statusRow.count as number
      }

      // Collect unique tags for branches of type 'tags'
      const tagsByColumn: Record<string, string[]> = {}
      const tagBranches = seed.branches.filter(branch => branch.type === 'tags')
      
      for (const branch of tagBranches) {
        // Use SQLite json_each to expand tags stored as JSON arrays
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

      for (const branch of seed.branches) {
        if (Object.hasOwn(data, branch.alias)) {
          columnNames.push(branch.alias)
          placeholders.push('?')
          queryBindings.push(serializeForDb(branch, data[branch.alias]))
        }
      }

      const sql = `INSERT INTO ${tableName} (${columnNames.join(', ')}) VALUES (${placeholders.join(', ')})`
      await this.database.prepare(sql).bind(...queryBindings).run()
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

      if (status) {
        updateClauses.push('status = ?')
        queryBindings.push(status)
      }

      for (const branch of seed.branches) {
        if (Object.hasOwn(data, branch.alias)) {
          updateClauses.push(`${branch.alias} = ?`)
          queryBindings.push(serializeForDb(branch, data[branch.alias]))
        }
      }

      if (updateClauses.length === 0) return

      updateClauses.push('updated_at = (unixepoch())')
      
      const sql = `UPDATE ${tableName} SET ${updateClauses.join(', ')} WHERE id = ?`
      queryBindings.push(id)

      const updateResult = await this.database.prepare(sql).bind(...queryBindings).run()
      if (updateResult.meta.changes === 0) {
        throw new EntryNotFoundError(`Entry ${id} not found in ${seed.slug}`)
      }
    } catch (error) {
      if (error instanceof EntryNotFoundError) throw error
      throw this.mapError(error, `update(${seed.slug}, ${id})`)
    }
  }

  async delete(seed: Seed, id: string): Promise<{ row: Record<string, any> }> {
    try {
      const tableName = this.getTableName(seed.slug)
      
      // Retrieve the row before deletion to allow for potential cleanup (e.g., media files in R2)
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
      const columnNames = ['entry_id']
      const placeholders = ['?']
      const queryBindings: any[] = [entryId]
      const updateClauses: string[] = []

      for (const branch of seed.branches) {
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
      await this.database.prepare(sql).bind(...queryBindings).run()
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

      // Filter out nulls from draft row (only include explicitly provided fields)
      const draftData: Record<string, any> = {}
      for (const branch of seed.branches) {
        if (draftRow[branch.alias] !== null) {
          draftData[branch.alias] = deserializeFromDb(branch, draftRow[branch.alias])
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
        .first()

      if (!draftRow) {
        throw new EntryNotFoundError(`No draft found for ${entryId} in ${seed.slug}`)
      }

      // Build UPDATE clause for the live table using data from the draft
      const updateClauses: string[] = []
      const queryBindings: any[] = []

      for (const branch of seed.branches) {
        if (draftRow[branch.alias] !== null) {
          updateClauses.push(`${branch.alias} = ?`)
          queryBindings.push(draftRow[branch.alias])
        }
      }

      updateClauses.push('updated_at = (unixepoch())')
      
      const updateSql = `UPDATE ${liveTableName} SET ${updateClauses.join(', ')} WHERE id = ?`
      queryBindings.push(entryId)

      // Execute batch to atomically update live table and delete draft
      await this.database.batch([
        this.database.prepare(updateSql).bind(...queryBindings),
        this.database.prepare(`DELETE FROM ${draftTableName} WHERE entry_id = ?`).bind(entryId)
      ])
    } catch (error) {
      if (error instanceof EntryNotFoundError) throw error
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
